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

let exports = undefined;
let expectedID = undefined;

Object.defineProperty(g, 'exports', {
  get() {
    // we were fetched, great
    if (exports === undefined) {
      exports = {};
    }
    return exports;
  },
  set(v) {
    // we were set, that's also fine, implicitly clears undefined
    exports = v;
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

/**
 * @type {!Object<string, *>}
 */
const registry = {
  'require': null,  // nb: we fill this in at the end of file
  'module': g.module,
};

/**
 * @return {*} the this object
 */
function globalForModule() {
  if (typeof window === 'object') {
    return window;
  } else if (typeof global === 'object') {
    return global;
  }
  return this;  // probably undefined
}

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function require(id) {
  const exports = registry[id];
  if (exports === undefined) {
    throw new TypeError(`require() can't resolve: ${id}`);
  }
  return exports;
}

registry['require'] = require;

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
  if (expectedID !== undefined) {
    throw new Error('cjs-faker had define() called multiple times')
  }
  expectedID = id;

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

  // resolve dependencies
  let passedExports = null;
  const passed = deps.map((dep) => {
    if (dep === 'exports') {
      passedExports = passedExports || {};
      return passedExports;
    } else if (!(dep in registry)) {
      throw new TypeError(`AMD can't resolve: ${dep}`);
    }
    return registry[dep];
  });

  // call the AMD loader
  const t = globalForModule();
  const localExports = fn.apply(t, passed);

  // favour passedExports if exports has no values
  // see: https://github.com/requirejs/requirejs/blob/master/require.js#L886
  let exportsHasValues = false;
  for (let k in exports) {
    exportsHasValues = true;
    break;
  }
  if (!exportsHasValues) {
    exports = undefined;
  }
  exports = localExports || exports || passedExports || {};

  // nb. define() doesn't return anything
}

/**
 * https://github.com/jquery/jquery/pull/331#issue-779774
 *
 * @type {!Object<string, boolean>}
 */
define.amd = {jQuery: true};

/**
 * @param {string=} id
 * @return {*} literally anything exported
 */
function getter(id = undefined) {
  if (exports === undefined) {
    throw new TypeError('cjs-faker found no exported module');
  }

  if (id === undefined || typeof id !== 'string') {
    if (!expectedID) {  // look for null/undefined
      throw new TypeError(`cjs-faker can\'t register module without ID`);
    }
    id = expectedID;
  } else if (expectedID && id !== expectedID) {
    throw new TypeError(`cjs-faker got ID mismatch: define was ${expectedID}, passed ${id}`)
  }

  if (id === 'exports') {
    throw new TypeError(`cjs-faker can't export 'exports'`);
  } else if (id in registry) {
    throw new TypeError(`cjs-faker already registered: ${id}`);
  }

  registry[id] = exports;
  exports = undefined;  // clear
  expectedID = undefined;
  return registry[id];
}

g.define = define;
g.require = require;

export default getter;
