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
 * @fileoverview Fakes commonJS boilerplate to allow importing legacy code as an ES6 module.
 *
 * Implemented by providing fake exports/module.exports and require() calls that are used by the
 * code being included. Use this library by providing a shim wrapping file per-library:
 *
 *    import faker from './require-faker.js';
 *    import './path/to/commonjs/module.js';
 *    export default faker('moduleid');
 *
 * This shim file will now provide module.exports as the default ES6 module export. If your legacy
 * code requires other modules via require(), then it's your responsibility to shim those files
 * _first_.
 *
 * Not really intended for production (unless you use Rollup), more of a thought experiment.
 */

let exports = undefined;

Object.defineProperty(window, 'exports', {
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

window.module = Object.seal({
  get exports() {
    return window.exports;
  },
  set exports(v) {
    window.exports = v;
  },
});

const registry = {};

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
window.require = function(id) {
  const exports = registry[id];
  if (exports === undefined) {
    throw new TypeError(`require() can't resolve: ${v}`);
  }
  return exports;
};

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function getter(id) {
  if (exports === undefined) {
    throw new TypeError(`require-faker found no exported module`);
  }
  registry[id] = exports;
  exports = undefined;  // clear
  return registry[id];
}

export default getter;
