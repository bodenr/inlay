
var util = require('util'),
    RE_CHARS = ['[', ']', '-', '{', '}', '*', '+', '#', '$', '^', '.', '?', '(', ')'],
    invokeToken = '@',
    invoke = '\\@',
    macroToken = '$$',
    macro = '\\$\\$';

exports.templateToken = function() {
    if (arguments.length === 0) {
        return invokeToken;
    }
    invokeToken = arguments[0];
    invoke = escape(invokeToken);
};

exports.macroToken = function() {
    if (arguments.length === 0) {
        return macroToken;
    }
    macroToken = arguments[0];
    macro = escape(macroToken);
};

function escape(str) {
    var len = str.length, formatted = '', char;
    for (var i = 0; i < len; i++) {
        char = str.charAt(i);
        if (~RE_CHARS.indexOf(char)) {
            formatted += '\\' + char;
        } else {
            formatted += char;
        }
    }
    return formatted;
};

function csvToArray(str, startToken, endToken) {
    return parseArgs(str, true, startToken, endToken);
};

function parseArgs(str, asArgArray, startToken, endToken) {
    var len = str.length, b = 1, args = [], argStr = '', c = '',
        startToken = startToken || '(', endToken = endToken || ')';
    if (asArgArray) {
        args = [];
    }

    function pushArg(argString) {
        argStr = argStr.trim();
        if (argStr !== '') {
            args.push(argStr);
        }
        argStr = '';
    }

    for (var i = 0; i < len; i++) {
        c = str.charAt(i);
        if (c === startToken) {
            b++;
        } else if (c === endToken) {
            b--;
        } else if (asArgArray && c === ',' && b == 1) {
            pushArg(argStr);
            continue;
        }

        if (b === 0) {
            if (asArgArray) {
                pushArg(argStr);
            }
            return asArgArray ? args : argStr;
        }
        argStr += c;
    }
    if (asArgArray) {
        pushArg(argStr);
    }
    return asArgArray ? args : argStr;
};

function BaseRe(re, fns, proto, string) {
    proto = proto || BaseRe.prototype;

    this.re = re instanceof RegExp ? re : new RegExp(re);
    this.result = null;
    this.str = string;

    fns.unshift('match');
    fns.push(['index', function() {return this.result ? this.result.index : null;}]);
    fns.push(['src', function() {return this.result ? this.result.input : this.str;}]);

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
    this.exec();
};

BaseRe.prototype.exec = function() {
    this.result = this.re.exec(this.str);
    return this;
};

BaseRe.prototype.none = function() {
    return this.result === null;
};

BaseRe.prototype.next = function() {
    return this.exec();
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
    do {
        this.exec();
        if (this.result) {
            fn(this);
        }
    } while (this.result);

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

function execRe() {
    this.result = this.re.exec.apply(this.re, [this.str]);
    if (this.result) {
        this.re.lastIndex = this.index() + this.match().length;
    }
    return this;
};

var InvokeRe = exports.InvokeRe = function(string) {
    BaseRe.call(this, new RegExp(invoke + '(\\w+)\\(([^]*)', 'g'),
            ['template',
             ['params', function(params, csv) {
                 params = parseArgs(params, csv);
                 return params;
            }]],
            InvokeRe.prototype, string);

    this.exec = execRe;

    this.match = function() {
        if (this.result && this.result[0]) {
            var args = this.params(), id = this.template();
            return invokeToken + id + '(' + args + ')';
        }
    };
};
util.inherits(InvokeRe, BaseRe);

var MacroInvokeRe = exports.MacroInvokeRe = function(string) {
    BaseRe.call(this, new RegExp(macro + '(\\w+)\\(([^]*)', 'g'),
            ['name',
             ['params', function(params, csv) {
                 return parseArgs(params, csv);
            }]],
            MacroInvokeRe.prototype, string);

    this.exec = execRe;

    this.match = function() {
        if (this.result && this.result[0]) {
            var args = this.params(), id = this.name();
            return macroToken + id + '(' + args + ')';
        }
    };
};
util.inherits(MacroInvokeRe, BaseRe);

var ArgumentsRe = exports.ArgumentsRe = function(string) {
    BaseRe.call(this, /\$\{(\w+)\}/g,
            ['args'],
            ArgumentsRe.prototype, string);
};
util.inherits(ArgumentsRe, BaseRe);

var MacroRe = exports.MacroRe = function(string) {
    BaseRe.call(this, /__macro__\[(\w+)\]\[([^]*)/g,
            ['name',
            ['params', function(params, csv) {
                return parseArgs(params, csv || false, '[', ']');
            }]],
            MacroRe.prototype, string);

    this.exec = execRe;

    this.match = function() {
        if (this.result && this.result[0]) {
            var args = this.params(), id = this.name();
            return '__macro__[' + id + '][' + args + ']';
        }
    };
};
util.inherits(MacroRe, BaseRe);

var TemplateRe = exports.TemplateRe = function(string) {
    BaseRe.call(this, /__template__\[(\w+)\]\[([^]*)/g,
            ['name',
            ['params', function(params, csv) {
                return parseArgs(params, csv || false, '[', ']');
            }]],
            TemplateRe.prototype, string);

    this.exec = execRe;

    this.match = function() {
        if (this.result && this.result[0]) {
            var args = this.params(), id = this.name();
            return '__template__[' + id + '][' + args + ']';
        }
    };
};
util.inherits(TemplateRe, BaseRe);

var NamedTemplateRe = exports.NamedTemplateRe = function(string, id) {
    BaseRe.call(this,
            new RegExp('__template__\\[' + id + '\\]\\[([^]*)', 'g'),
            [['params', function(params, csv) {
                return parseArgs(params, csv || false, '[', ']');
            }]],
            NamedTemplateRe.prototype, string);

    this.id = id;
    this.exec = execRe;

    this.match = function() {
        if (this.result && this.result[0]) {
            var args = this.params();
            return '__template__[' + this.id + '][' + args + ']';
        }
    };
};
util.inherits(NamedTemplateRe, BaseRe);

var VariableRe = exports.VariableRe = function(string) {
    BaseRe.call(this, /__args__\((\w*)\)/g,
            ['name'], VariableRe.protype,
            string);
};
util.inherits(VariableRe, BaseRe);
