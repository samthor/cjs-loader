
define('foo', ['./base64.js'], function(base64) {
  console.info('foo got base64', base64, 'required', require('./base64.js'));
  return {foo: 'i am foo', base64};
});
