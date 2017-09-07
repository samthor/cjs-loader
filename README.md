cjs-loader transitively includes commonJS modules for use on the web.
It does this using your browser and without a compile step.
[Go here for a demo](https://samthor.github.io/cjs-loader/demo/index.html).

🔥👨‍💻🔥 This is a successful but terrible idea and should not be used by anyone.
It reqiures support for ES6 Modules 🛠️ and has only really been tested on Chrome 62+.

# Usage

First, install modules you want to use with NPM or Yarn.
These cannot use built-in Node modules, such as `fs` or `path`.
Then, use the loader:

```js
import {load, setup} from './path/to/cjs-loader.js';
setup('./path/to/cjs-loader.js');

load('npm-package-name').then((out) => {
  // do whatever as if you require()'d the package
});
```

To use Handlebars, for example:

```js
load('handlebars').then((handlebars) => {
  const Handlebars = handlebars.create();

  const source = '<p>Hello {{name}}, you have {{name.length}} letters</p>';
  const template = Handlebars.compile(source);
  console.info(template({name: 'Sam'}));
});
```

Handlebars internally fetches about ~35 modules (via `require()`), which we wrap.

# Implementation

1. Stub out `module.exports`, `require()` etc.
2. Load the target module as an ES6 module^
  * If a further dependency is unavailable in `require()`, throw a known exception
  * Catch in a global handler, and load the dependency via step 2
  * Retry running the target module when done

^more or less

[We also abuse](https://gist.github.com/samthor/8c5ebf3239bfeaca6c92299bb12b2a79) the fact that Chrome reruns but does _not_ need to reload script files with the same path, but a different hash.
This allows for "efficient" retries.
e.g.:

```js
import * as foo1 from './foo.js#1';
import * as foo2 from './foo.js#2';
foo1 !== foo2  // not the same, but only caused one network request
```

# Notes

## Caveats

* Don't use this in production.
  It's horrible.

* Modules can't _really_ determine their path, so if one of your dependenies is from a 302 etc, all bets are off

## TODOs

* We should coalesce multiple failures to `require()` (just return `null` until an actual error occurs) and request further code in parallel

* This code is forked from [cjs-faker](https://github.com/samthor/cjs-faker), and still supports AMD, but calling an unplanned `require()` from within `define()` doesn't work yet

