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
  throw new TypeError(`cjs-faker can't choose global object`);
}

let globalScope = undefined;
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
  /**
   * @param {*=} value
   */
  constructor(value = undefined) {
    this.value = value;
    this.done = null;

    if (value === undefined) {
      this.p = new Promise((resolve, reject) => {
        this.done = (v) => {
          v instanceof Error ? reject(v) : resolve(v);
          console.info('resolved cache', v);
          this.done = null;
        };
      });
      this.p.then((v) => this.value = v);
      this.p.catch((err) => this.value = err);
    } else {
      this.p = Promise.resolve(value);
    }
  }
}

/**
 * @type {!Object<string, {p: !Promise<*>, r: function(*)}>}
 */
const cache = {
  'require': new CacheEntry(require),
  'module': new CacheEntry(g.module),
};

/**
 * @type {!Object<string, string>}
 */
const paths = {};

/**
 * @param {string}
 * @return {boolean}
 */
function isRelative(id) {
  return id.startsWith('./') || id.startsWith('../');
}

function resolvePath(id) {
  const url = idToURL(id);
  if (!url) {
    // TODO: this resolve async-ish
    return 'node_modules/';
  }

}

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function require(id) {
  console.debug('require being invoked', id, 'got scope', globalScope);

  let path = paths[globalScope] || globalScope;
  if (isRelative(id)) {
    const prefix = 'http://x/';
    const u = new URL(id, prefix + path);
    path = u.href.substr(prefix.length);

    if (path.lastIndexOf('.') <= path.lastIndexOf('/')) {
      path += '.js';
    }
  } else {
    throw new TypeError('FIXME: support node_modules dep on other node_modules')
  }

  console.info('real path', path);

  const entry = cache[id];
  if (entry === undefined) {
    throw new TypeError(`require() can't resolve: ${id}`);
  } else if (entry.value === undefined) {
    throw new TypeError(`require() module not ready: ${id}`);
  } else if (entry.value instanceof Error) {
    throw entry.value;
  }
  return entry.value;
}

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
    // TODO: this could be supported (although we only know 'requester' ID)
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
  if (id.startsWith('./') || id.startsWith('../')) {
    return new URL(id, window.location);
  }
  return null;  // magic URL
}

/**
 * @param {string} content
 * @return {!HTMLScriptElement}
 */
function insertOrderedScript(content) {
  const s = document.createElement('script');
  s.type = 'module';
  s.async = false;
  s.textContent = content;
  document.head.appendChild(s);
  s.remove();
  return s;
}

export async function load(id) {
  if (id in cache) {
    return cache[id].p;
  }

  let url = idToURL(id);
  if (!url) {
    // TODO: x-origin/credentials stuff
    const request = await g.fetch(`node_modules/${id}/package.json`);
    const json = await request.json();

    // TODO: use 'jsnext:main'
    const path = json['main'];
    if (path === undefined) {
      throw new TypeError('cjs-faker can\'t read main for: ' + id);
    }

    paths[id] = `node_modules/${id}/${path}`;
    url = new URL(`node_modules/${id}/${path}`, window.location);
  }

  // FIXME: path to cjs-faker??
  // FIXME: escape url, id

  // insert early script to setup scope
  insertOrderedScript(`
import {scope} from '../cjs-faker.js';
scope('${id}');
  `);
  // TODO: we can use above to create/teardown globals

  // insert actual script
  const script = insertOrderedScript(`
import faker from '../cjs-faker.js';
import '${url}';
faker('${id}');
  `);

  const entry = new CacheEntry();
  script.onerror = entry.done;
  cache[id] = entry;
  return entry.p;
}

/**
 * Store the current execution scope until a call to faker.
 *
 * @param {string} id
 */
export function scope(id) {
  globalScope = id;
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
  globalScope = undefined;
  const entry = cache[id];

  if (defined === undefined) {
    entry.done(globalExports);
    globalExports = undefined;  // clear
    return;
  }

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
  entry.done(Promise.all(passed).then((all) => {
    // performs exports dance, see requireJS for some guidance:
    // https://github.com/requirejs/requirejs/blob/master/require.js#L886
    globalExports = heldExports;
    const returnedExports = local.fn.apply(g, all);
    const localExports = withKeys(exports);  // if global exports has no keys, assume unused
    globalExports = undefined;
    return returnedExports || localExports || passedExports;
  }));

  // nb. define() doesn't return anything
}

g.define = define;
g.require = require;

export default faker;
