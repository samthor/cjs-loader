
// TODO: should be ok to be "foo", not "./foo.js"—direct import will always mismatch
define('foo', ['./base64.js'], function(base64) {
  console.info('foo got base64', base64, 'required', require('./base64.js'));
  return {foo: 'i am foo', base64};
});
