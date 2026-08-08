// providers/captcha → lib/captcha 로 위임
// ref: lib/captcha/index.js (실제 CAPTCHA 매니저)
'use strict';
module.exports = require('../../captcha/index');
