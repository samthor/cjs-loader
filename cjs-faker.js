/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * @fileoverview Fakes commonJS and AMD boilerplate to allow importing legacy code via ES6 modules.
 *
 * Implemented by providing fake exports/module.exports, require() and define() calls that are used
 * by the code being included. Use this library by providing a shim wrapping file per-library:
 *
 *    import faker from './require-faker.js';
 *    import './path/to/commonjs/module.js';
 *    export default faker('moduleid');
 *
 * This shim file will now provide the exported code (via module.exports or define()) as the
 * default ES6 module export. If your legacy code requires other modules via require() or as deps
 * arguments to define(), then it's your responsibility to shim those files _first_.
 *
 * Not really intended for production (unless you use Rollup), more of a thought experiment.
 */

const g = (typeof window === 'object' ? window : (typeof global === 'object' ? global : null));
if (!g) {
  throw new TypeError('');
}

let globalExports = undefined;
let defined = undefined;

Object.defineProperty(g, 'exports', {
  get() {
    // we were fetched, great
    if (globalExports === undefined) {
      globalExports = {};
    }
    return globalExports;
  },
  set(v) {
    // we were set, that's also fine, implicitly clears undefined
    globalExports = v;
  },
})

g.module = {
  get exports() {
    return g.exports;
  },
  set exports(v) {
    g.exports = v;
  },
};

const functionMatch = /^function\s*\w*\(([\w\s,]+)\) {/;

/**
 * @param {!Function} fn
 * @return {!Array<string>} array of simple arg names (no =, ... etc)
 */
function argNames(fn) {
  const match = functionMatch.exec(fn.toString());
  if (!match) {
    return [];
  }
  const args = match[1].split(',').map((x) => x.trim());
  if (args.length && args[args.length - 1] === '') {
    args.pop();
  }
  return args;
}

class CacheEntry {
  constructor(value) {
    if (value instanceof Promise) {
      this.value = null;
      value.then((out) => this.value = out);
    } else {
      this.value = value;
    }
  }

  resolve(value) {
    
  }
}

/**
 * @type {!Object<string, {p: !Promise<*>, r: function(*)}>}
 */
const cache = {
  'require': null,  // nb: we fill this in at the end of file
  'module': {p: Promise.resolve(g.module)},
};

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function require(id) {
  const exports = cache[id];
  if (exports === undefined) {
    throw new TypeError(`require() can't resolve: ${id}`);
  }
  return exports;
}

cache['require'] = {p: Promise.resolve(require)};

/**
 * @param {...(string|!Array<string>|!Function)} args
 */
function define(...args) {
  let id = null, deps = null;

  if (typeof args[0] === 'string') {
    id = args.shift();
  }
  if (typeof args[0] === 'object' && 'length' in args[0]) {
    deps = args.shift();
  }
  if (args.length !== 1 || typeof args[0] !== 'function') {
    throw new Error('cjs-faker define got unexpected args: wanted [id,][deps,]func');
  }
  const fn = args.shift();

  // prevent duplicate define()
  if (defined !== undefined) {
    throw new Error('cjs-faker had define() called multiple times')
  }

  // create default deps
  if (deps === null) {
    if (fn.length) {
      // look for 'Simplified CommonJS Wrapper'
      deps = argNames(fn);
      const s = deps.join(', ');
      if (s !== 'require' && s !== 'require, exports, module') {
        throw new Error('cjs-faker defined method expected args: ' +
            `'require' or 'require, exports, module', was: ${s}`);
      }
    } else {
      deps = [];
    }
  }

  // store for later
  defined = {id, deps, fn};
}

/**
 * https://github.com/jquery/jquery/pull/331#issue-779774
 *
 * @type {!Object<string, boolean>}
 */
define.amd = {jQuery: true};

/**
 * @param {string} id to convert to URL
 * @return {URL} null if unresolvable
 */
function idToURL(id) {
  try {
    return new URL(id);  // absolute
  } catch (e) {
    // ok
  }
  if (id.startsWith('./')) {
    return new URL(id, window.location);
  }
  return null;  // magic URL
}

export async function load(id) {
  if (id in cache) {
    return cache[id].p;
  }

  const url = idToURL(id);
  if (!url) {
    // TODO
    throw new Error('TODO node_modules magic foo: ' + id);
  }

  const entry = {};
  cache[id] = entry;

  // TODO: x-origin/credentials stuff
  // FIXME: path to cjs-faker??
  // FIXME: escape url, id
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `
import faker from '../cjs-faker.js';
import '${url}';
faker('${id}');
  `;
  document.head.appendChild(script);
  script.remove();

  return entry.p = new Promise((resolve, reject) => {
    entry.r = resolve;
    script.onerror = reject;
  });
}

/**
 * @param {!Object} object
 * @return {Object}
 */
function withKeys(object) {
  for (let k in object) {
    return object;
  }
  return null;
}

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function faker(id) {
  const entry = cache[id];

  if (defined === undefined) {
    console.debug('requireJS module', id, 'resolving with', exports);
    entry.r(globalExports);
    globalExports = undefined;  // clear
    return;
  }

  console.debug('AMD module', id, 'with pending deps', defined.deps);

  // TODO: check id vs defined
  const local = defined;
  const heldExports = globalExports;  // in case the AMD module mucked with them before running
  defined = undefined;
  globalExports = undefined;

  // resolve dependencies
  const passedExports = {};
  const passed = local.deps.map((dep) => {
    return dep === 'exports' ? passedExports : load(dep);
  });
  const p = Promise.all(passed).then((all) => {
    // performs exports dance, see requireJS for some guidance:
    // https://github.com/requirejs/requirejs/blob/master/require.js#L886
    globalExports = heldExports;
    const returnedExports = local.fn.apply(g, all);
    const localExports = withKeys(exports);  // if global exports has no keys, assume unused
    globalExports = undefined;
    return returnedExports || localExports || passedExports;
  });

  entry.r(p);
  // nb. define() doesn't return anything
}

g.define = define;
g.require = require;

export default faker;
