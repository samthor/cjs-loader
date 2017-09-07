cjs-faker fakes commonJS and AMD boilerplate to allow importing legacy code via ES6 modules.

This is implemented by providing fake `exports`/`module.exports`, `require()` and `define()` calls that are used by the commonJS or AMD code being included.
You must shim _all_ modules that you depend on.

# Rationale

This approach is mostly a thought experiment in evaluating legacy code at runtime, rather than requiring a build step (as `require()` and `define()` are not supported natively by browsers).

For most practical purposes, you'll be better off using Rollup with [its commonJS plugin](https://github.com/rollup/rollup-plugin-commonjs).
Using Rollup requires a build step before you can import legacy code as an ES6 module, but doesn't require a shim per module in the dependency tree.

# Usage

Usage requires providing a shim around all commonJS or AMD modules:

```js
// wrap_base64.js
import faker from './node_modules/cjs-faker/cjs-faker.js';
import 'https://cdn.rawgit.com/mathiasbynens/base64/a8d7cabd/base64.js';
export default faker('base64');
```

Now you can just use the `base64` module inside ES6:

```js
import base64 from './wrap_base64.js';
console.info(base64.encode('Hello!'));

// or use require() itself for already wrapped modules
const base64 = require('base64');
```

No build steps are required.

## Dependency Tree

If you depend on commonJS module A, which depends on commonJS module B etc, you must provide the shim for B first, then A.
The default `faker` method in the examples fills a registry that is available via the global `require()` call, so B has to be shimmed first for A's `require('a')` call to succeed.

See file B:

```js
// wrap_b.js
import faker from './node_modules/cjs-faker/cjs-faker.js';
import './path/to/b.js';
export default faker('b');
```

And file A:

```js
// wrap_a.js
import faker from './node_modules/cjs-faker/cjs-faker.js';
import './path/to/a.js';
export default faker('a');
```
