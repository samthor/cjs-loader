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
 * @fileoverview Transitively includes commonJS modules for use on the web.
 *
 * This is a successful but terrible idea and should not be used by anyone.
 */

import * as utils from './utils.js';

const config = {
  global: window,
  location: window.location.href,  // take initial copy
  modules: 'node_modules',
  path: null,
};

config.global.define = define;
config.global.require = require;

let state = undefined;
let globalExports = undefined;
let defined = undefined;

Object.defineProperty(config.global, 'exports', {
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

config.global.module = {
  get exports() {
    return config.global.exports;
  },
  set exports(v) {
    config.global.exports = v;
  },
};

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
 * @type {!Object<string, !CacheEntry>}
 */
const cache = {
  'require': new CacheEntry(require),
  'module': new CacheEntry(config.global.module),
};

class FakeRequireError {
  constructor(state, required) {
    this.state = state;
    this.required = required;
  }
}
window.addEventListener('error', (ev) => {
  const e = ev.error;
  if (!(e instanceof FakeRequireError)) { return; }

  ev.preventDefault();
  ev.stopPropagation();

  // load the module that was require()'d, and then reload the thing it depended on
  load(e.required).then(() => {
    reload(e.state.id, e.state.url);
  });
});

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
function require(id) {
  let url = resolvePath(id);
  if (url !== null) {
    id = url;
  }

  const entry = cache[id];
  if (entry === undefined) {
    // TODO: don't throw immediately, get as many require() calls as possible
    throw new FakeRequireError(state, id);
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
  if (defined !== undefined) {
    // TODO: this could be supported (although we only know 'requester' ID)
    throw new Error('cjs-loader had define() called multiple times')
  }
  defined = utils.argsForDefine(args);  // store for later
}

/**
 * https://github.com/jquery/jquery/pull/331#issue-779774
 *
 * @type {!Object<string, boolean>}
 */
define.amd = {jQuery: true};

export async function load(id) {
  let url = resolvePath(id);
  if (url === null) {
    // this is actually a node module, fetch package.json
    const request = await config.global.fetch(`./${config.modules}/${id}/package.json`);
    const json = await request.json();
    const cand = `./${config.modules}/${id}/${(json['main'] || 'index.js')}`;
    url = resolvePath(cand);
  } else {
    id = url;  // absolute fetch uses URL as id
  }

  if (id in cache) {
    return cache[id].p;
  }
  const entry = new CacheEntry();
  cache[id] = entry;

  reload(id, url);

  return entry.p;
}

let scriptCount = 0;  // used to force rerun, but _not_ reload

function reload(id, url) {
  if (!config.path) {
    throw new Error('cjs-loader needs setup() called with its path')
  }
  const escape = (s) => s.replace(/'/g, '\\\'');

  // insert early script to setup scope
  utils.insertModuleScript(`
import {env} from '${escape(config.path)}';
env('${escape(id)}', '${escape(url)}');
  `);
  // TODO: we can use above to create/teardown globals

  // insert actual script
  const script = utils.insertModuleScript(`
import {faker} from '../cjs-loader.js';
import '${escape(url)}#${++scriptCount}';
faker('${escape(id)}');
  `);
  script.onerror = cache[id].done;  // only for network/other errors
}

/**
 * @param {string} id
 * @return {string} absolute path, including domain
 */
function resolvePath(id) {
  try {
    // look for http://.. or similar
    const absolute = new URL(id);
    return absolute.href;
  } catch (e) {
    // nothing, this is fine
  }

  if (!id.includes('/')) {
    return null;  // module
  }

  let pathname;
  const leadingPart = id.split('/', 1)[0];
  switch (leadingPart) {
  case '':
    pathname = id;
    break;

  case '.':
  case '..':
    if (state) {
      // remove last component
      const dirname = state.url.substr(0, state.url.lastIndexOf('/'));
      pathname = `${dirname}/${id}`;
    } else {
      pathname = `${config.location}/${id}`;
    }
    break;

  default:
    pathname = `${config.location}/${config.modules}/${id}`;
  }

  // poor man's normalize
  const u = new URL(pathname, config.location);
  u.pathname = u.pathname.replace(/\/+/g, '/');

  // FIXME: ugly hack to assume .js, needed for Handlebars, will break .json loading
  if (!u.pathname.endsWith('.js')) {
    u.pathname += '.js';
  }
  return u.href;
}

/**
 * Store the current execution path until a call to faker.
 *
 * @param {string} id
 * @param {string} url
 */
export function env(id, url) {
  state = {id, url};
}

/**
 * @param {string} id
 * @return {*} literally anything exported
 */
export function faker(id) {
  if (state.id !== id) {
    throw new Error(`invalid state.id=${state.id} id=${id}`);
  }
  state = undefined;
  const entry = cache[id];

  if (defined === undefined) {
    entry.done(globalExports);
    globalExports = undefined;  // clear
    return;
  }

  // TODO: check id vs defined for AMD
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
    const returnedExports = local.fn.apply(config.global, all);
    const localExports = utils.withKeys(exports);  // if global exports has no keys, assume unused
    globalExports = undefined;
    return returnedExports || localExports || passedExports;
  }));
}

/**
 * @param {string} path to cjs-loader
 */
export function setup(path) {
  config.path = path;
}