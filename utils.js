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

const functionMatch = /^function\s*\w*\(([\w\s,]+)\) {/;

/**
 * Extracts the simple argument names from the passed function object. Returns an empty array if
 * none could be determined, or they were complex (default values, {}'s etc)
 *
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
 * Extracts the args from a define() cal. Throws TypeError on invalid arguments.
 *
 * @param {!Array<(string|!Array<string>|!Function)>} args should be between 1 and 3
 * @return {{id: ?string, deps: !Array<string>, fn: !Function}}
 */
export function argsForDefine(args) {
  let id = null, deps = null;

  if (typeof args[0] === 'string') {
    id = args.shift();
  }
  if (typeof args[0] === 'object' && 'length' in args[0]) {
    deps = args.shift();
  }
  if (args.length !== 1 || typeof args[0] !== 'function') {
    throw new TypeError('got unexpected args: wanted [id,][deps,]func');
  }
  const fn = args.shift();
  if (args.length || fn === undefined) {
    throw new TypeError('got unexpected args count: wanted 1-3');
  }

  // no deps or simple deps
  if (!fn.length && deps === null) {
    deps = [];
  } else if (deps === null) {
    // look for 'Simplified CommonJS Wrapper'
    deps = argNames(fn);
    const s = deps.join(',');
    if (s !== 'require' && s !== 'require,exports,module') {
      throw new TypeError(
          `expected callback args: 'require'/'require,exports,module', was: '${s}'`);
    }
  }

  return {id, deps, fn};
}

/**
 * @param {string} path
 * @return {string} path
 */
export function normalize(path) {
  const parts = path.split('/');

  let i = 1;
  while (i < parts.length) {
    const curr = parts[i];

    if (curr === '.' || curr === '') {
      parts.splice(i, 1);
      continue;
    } else if (curr !== '..') {
      ++i;
      continue;
    }

    const prev = parts[i - 1];
    if (prev === '') {
      // at root
      parts.splice(i, 1);
    } else if (prev === '..') {
      // can't eat prev ..
      ++i;
    } else if (prev === '.') {
      // left is relative
      parts.splice(i-1, 1);
    } else {
      // eat both
      parts.splice(--i, 2);
    }
  }

  return parts.join('/');
}

/**
 * @param {string} content to use for code
 * @return {!HTMLScriptElement}
 */
export function insertModuleScript(content) {
  const s = document.createElement('script');
  s.type = 'module';
  s.async = false;
  s.textContent = content;
  document.head.appendChild(s);
  s.remove();  // remove immediately, runs anyway
  return s;
}

/**
 * @param {!Object} object to return if it has keys
 * @return {Object} object if it had keys
 */
export function withKeys(object) {
 for (let k in object) {
   return object;
 }
 return null;
}
