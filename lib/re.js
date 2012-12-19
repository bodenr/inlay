
var util = require('util');

function csvToArray(str) {
    if (str === '' || str === null) {
        return [];
    }
    var args = str.split(','), len = args.length;
    for (var i = 0; i < len; i++) {
        args[i] = args[i].trim();
    }
    return args;
};

function BaseRe(re, fns, proto, string) {
    proto = proto || BaseRe.prototype;

    this.re = re instanceof RegExp ? re : new RegExp(re);
    this.result = null;
    this.str = string;

    fns.unshift('match');
    fns.push('index');
    fns.push('src');

    function indexed(index, fn) {
        return function() {
            if (fn) {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(this.result ? this.result[index] : null);
                return fn.apply(this, args);
            } else {
                return this.result ? this.result[index] : null;
            }
        };
    };

    var len = fns.length;

    for (var i = 0; i < len; i++) {
        if (fns[i] instanceof Array) {
            proto[fns[i][0]] = indexed(i, fns[i][1]);
        } else {
            proto[fns[i]] = indexed(i);
        }
    }

    this.result = this.re.exec(this.str);
};

BaseRe.prototype.none = function() {
    return this.result === null;
};

BaseRe.prototype.next = function() {
    this.result = this.re.exec(this.str);
    return this;
};

BaseRe.prototype.reset = function() {
    this.result = null, flags = '';
    flags += this.re.global ? 'g' : '';
    flags += this.re.ignoreCase ? 'i' : '';
    flags += this.re.multiline ? 'm' : '';
    flags += this.re.sticky ? 'y' : '';
    this.re = new RegExp(this.re.source, flags === '' ? null : flags);
    return this;
};

BaseRe.prototype.each = function(fn, fromCurrent) {
    if (!fromCurrent) {
        this.reset();
    }
    while ((this.result = this.re.exec(this.str))) {
        fn(this);
    }
    return this;
};

var FunctionRe = exports.FunctionRe = function(string) {
    BaseRe.call(this, /function\s*\(([^)]*)\)\s*\{\r*\n*([^]*)/g,
            [['args', csvToArray],
             ['body', function(body) {
                var cur = body.length - 1, char;
                for ( ; cur > 0; i--) {
                    char = body.charAt(cur);
                    if (char === '}') {
                        return body.substring(0, cur - 1);
                    }
                }
                return null;
            }]],
            FunctionRe.prototype, string);
};
util.inherits(FunctionRe, BaseRe);

var InvokeRe = exports.InvokeRe = function(string) {
    BaseRe.call(this, /@(\w+)\(([^)]*)\)/g,
            ['template',
             ['params', function(params, csv) {
                 return csv ? csvToArray(params) : params;
            }]],
            InvokeRe.prototype, string);
};
util.inherits(InvokeRe, BaseRe);

var ArgumentsRe = exports.ArgumentsRe = function(string) {
    BaseRe.call(this, /\$\{(\w+)\}/g,
            ['args'],
            ArgumentsRe.prototype, string);
};
util.inherits(ArgumentsRe, BaseRe);

var TemplateRe = exports.TemplateRe = function(string) {
    BaseRe.call(this, /__template__\[(\w+)\]\[([^\]]*)\]/g,
            ['name',
            ['params', csvToArray]],
            TemplateRe.prototype, string);
};
util.inherits(TemplateRe, BaseRe);

var NamedTemplateRe = exports.NamedTemplateRe = function(string, id) {
    BaseRe.call(this,
            new RegExp('__template__\\[' + id + '\\]\\[([^\\]]*)\\]', 'g'),
            [['params', csvToArray]],
            NamedTemplateRe.prototype, string);
};
util.inherits(NamedTemplateRe, BaseRe);

var VariableRe = exports.VariableRe = function(string) {
    BaseRe.call(this, /__args__\((\w*)\)/g,
            ['name'], VariableRe.protype,
            string);
};
util.inherits(VariableRe, BaseRe);
