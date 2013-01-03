
var path = require('path'),
    fs = require('fs'),
    util = require('util'),
    Module = require('module').Module,
    re = require('./re.js'),
    EventEmitter = require('events').EventEmitter,
    emitter = new EventEmitter,
    env = process.env.NODE_ENV || 'development',
    SEP = path.sep ? path.sep
            : process.platform === 'win32' ? '\\' : '/',
    JST_SUFFIX = /.jst$/,
    templates = {},
    rawExports,
    UNRESOLVED = 'UNRESOLVED',
    RESOLVED = 'RESOLVED',
    ACTIVE = 'ACTIVE',
    OPT_TEMPLATES = 'templates',
    OPT_SRC = 'src',
    OPT_OUT = 'out',
    OPT_VALIDATE = 'validate',
    OPT_DEBUG = 'debug',
    OPT_BEAUTIFY = 'beautify',
    OPT_INVOKE = 'invoke',
    OPT_MACRO = 'macro',
    opts = {
        src: './src',
        out: './lib',
        templates: './templates',
        validate: true,
        debug: false,
        beautify: true
    },
    IS_WIN = /win/gi.test(process.platform),
    errors = require('errors'),
    beautify = require('js-beautify').js_beautify;

// expose templates
exports.templates = {};

errors.create({name: 'FileSystemError'});
errors.create({name: 'TemplateError'});

function debug() {
    if (env == 'debug' || env == 'trace') {
        console.log.apply(this, arguments);
    }
};

function warn(msg) {
    console.log("WARNING: " + msg);
};

function options() {
    if (arguments.length === 2) {
        opts[arguments[0]] = arguments[1];
        if (arguments[0] === OPT_INVOKE) {
            re.templateToken(arguments[1]);
        } else if (arguments[0] == OPT_MACRO) {
            re.macroToken(arguments[1]);
        }
    } else if (arguments.length === 1) {
        return opts[arguments[0]];
    }
    return opts;
};

function isTemplate(file) {
    return JST_SUFFIX.test(file);
};

function mkdirs(p) {
    var dirs = path.normalize(p).replace(/\\/g, "/").split('/'),
        len = dirs.length, seg = '';

    if (!IS_WIN) {
        dirs.unshift('/' + dirs.shift());
    }

    for (var i = 0; i < len; i++) {
        seg += dirs[i];

        try {
            if (!fs.lstatSync(seg).isDirectory()) {
                throw new errors.FileSystemError(seg + " is not a directory.");
            }
        } catch (e) {
            fs.mkdirSync(seg);
            if (!fs.lstatSync(seg).isDirectory()) {
                throw new errors.FileSystemError('Cannot create directory: ' + seg);
            }
        }
        seg += "/";
    }
};

function exportDefs(src, dest) {
    var keys = Object.keys(src), len = keys.length;
    for (var i = 0; i < len; i++) {
        if (dest.hasOwnProperty(keys[i])) {
            warn("'" + keys[i] + "' is already defined and will be overwritten.");
        }
        dest[keys[i]] = src[keys[i]];
    }
}

function cacheRaw(module) {
    if (module.exports.macros) {
        if (!exports.macros) {
            exports.macros = module.exports.macros;
        } else {
            exportDefs(module.exports.macros, exports.macros);
        }
        debug('imported macros: ' + Object.keys(module.exports.macros));
        // remove so only templates are left
        delete module.exports.macros;
    }
    if (!rawExports) {
        rawExports = module.exports;
        return;
    }

    exportDefs(module.exports, rawExports);
};

function prep(str) {
    new re.MacroInvokeRe(str).each(function(invoke) {
        str = str.replace(invoke.match(),
                    '__macro__[' + invoke.name() + ']['
                    + invoke.params() + ']');
    });

    new re.InvokeRe(str).each(function(invoke) {
        str = str.replace(invoke.match(),
                    '__template__[' + invoke.template() + ']['
                    + invoke.params() + ']');
    });

    new re.ArgumentsRe(str).each(function(arg) {
        str = str.replace(arg.match(),
                '__args__(' + arg.args() + ')');
    });

    return str;
};

function loadTemplate(buff, filepath) {
    var module;

    buff = prep(buff);
    // let Module parse valid JS and encapsulate it in functions
    module = new Module(path.basename(filepath, '.jst'));
    module._compile(buff, filepath);
    cacheRaw(module);
};

function assertMacroUse(body) {
    var index;
    if ((index = body.indexOf('__macro__')) >= 0) {
        throw new errors.TemplateError("Unreplaced macro at index "
                + index + " in:\n" + body);
    }
};

function assertTemplateUse(body) {
    var index;
    if ((index = body.indexOf('__template__')) >= 0) {
        throw new errors.TemplateError("Unreplaced template at index "
                + index + " in:\n" + body);
    }
};

function assertArgUse(body) {
    var index;
    if ((index = body.indexOf('__args__')) >= 0) {
        throw new errors.TemplateError("Invalid replacement arguments at index "
                + index + " for:\n" + body);
    }
};

function assertBody(body) {
    assertMacroUse(body);
    assertTemplateUse(body);
    assertArgUse(body);
};

function resolved(template) {
    if (exports.templates[template.id]) {
        warn("Template '" + template.id + "' already exists and will be overwritten.");
    }

    debug('template resolved: ' + template.id);

    exports.templates[template.id] = function() {
        var args = arguments[0] instanceof Array
            ? arguments[0]
            : Array.prototype.slice.call(arguments);
        return template.use.apply(template, args);
    };

    emitter.emit(util.format('template.%s.resolved', template.id), template);
};

function applyMacros(src, Macro) {
    new Macro(src).each(function(macro) {
        if (!exports.macros[macro.name()] && options(OPT_VALIDATE)) {
            throw new errors.TemplateError("No macro found for: " + macro.name());
        } else if (exports.macros[macro.name()]) {
            src = src.replace(macro.match(),
                    exports.macros[macro.name()].apply(null, macro.params(true)));
        }
    });
    return src;
};

function Template(id, args, body) {
    this.id = id;
    this.args = args;
    this.body = body;
    this.state = UNRESOLVED;
    this.resolve();
};

Template.prototype.use = function() {
    var template = this.body, len = arguments.length;

    for (var i = 0; i < len; i++) {
        // apply argument based macros
        arguments[i] = applyMacros(arguments[i], re.MacroInvokeRe);

        template = template.replace(
                new RegExp('__args__\\(' + this.args[i] + '\\)', 'g'),
                arguments[i]);
    }
    // apply template macros
    template = applyMacros(template, re.MacroRe);

    if (this.state === ACTIVE) {
        assertBody(template);
    }
    return template;
};

Template.prototype.resolve = function() {
    if (this.state !== UNRESOLVED) {
        warn("Template '" + this.id + "' is already resolved. Nothing to do.");
        return;
    }

    debug('resolving template: ' + this.id);

    var unresolved = new re.TemplateRe(this.body);
    if (unresolved.none()) {
        this.state = RESOLVED;
        resolved(this);
        return;
    }

    var self = this;

    function dependencyResolved(template) {
        debug('template dependency resolved: ' + self.id + ' -> ' + template.id);

        var uses = new re.NamedTemplateRe(self.body, template.id);
        uses.each(function(use) {
            self.body = self.body.replace(use.match(),
                    exports.templates[template.id](use.params(true)));
        });
        try {
            assertTemplateUse(self.body);
        } catch (err) {
            return; // not resolved yet
        }
        // resolved
        self.state = RESOLVED;
        resolved(self);
    };

    // not resolved, wait for dependants
    unresolved.each(function(dependency) {
		var dependId = dependency.name();

        debug('template dependency found: ' + self.id + ' -> ' + dependId);

        if (templates[dependId] && templates[dependId].state !== UNRESOLVED) {
            debug('template dependency immediately resolvable: ' + self.id + ' -> ' + dependId);
            dependencyResolved(templates[dependId]);
        } else {
            debug('template dependency queued: ' + self.id + ' -> ' + dependId);
            emitter.once(util.format('template.%s.resolved', dependId), dependencyResolved);
        }
    });

};

Template.createInstance = function(id, fn) {
    var defn = fn.toString(),
        fnre = new re.FunctionRe(defn);

    if (fnre.none()) {
        throw new errors.TemplateError("Invalid function definition:\n", defn);
    }
    return new Template(id, fnre.args(), fnre.body());
};

function resolve() {
    var exportNames = Object.keys(rawExports),
        len = exportNames.length;

    for (var i = 0; i < len; i++) {
        template = Template.createInstance(exportNames[i], rawExports[exportNames[i]].toString());
        templates[template.id] = template;
    }
};

function visit(root, child, fn) {
    var child = child ? SEP + child : '',
        target = root + child;

    target = path.resolve(target);

    if (fs.statSync(target).isDirectory()) {
        var files = fs.readdirSync(target), len = files.length, file, fullPath;
        for (var i = 0; i < len; i++) {
            file = files[i];
            fullPath = target + SEP + file;

            if (fs.statSync(fullPath).isDirectory()) {
                visit(root, child + SEP + file, fn);
            } else {
                fn(root, child, file);
            }
        }
    } else {
        fn(path.dirname(target), child, path.basename(target));
    }
};

function processSrc(target) {
    var count = 0, start = new Date().getTime(),
        optBeautify = options(OPT_BEAUTIFY), beautifyOpts = {};

    if (optBeautify && optBeautify instanceof Object) {
        beautifyOpts = optBeautify;
    }

    visit(target, null, function(root, child, file) {
        if (/.js$/.test(file)) {
            var fullPath = path.resolve(root + child + SEP + file),
                src = fs.readFileSync(fullPath, 'utf8'), outDir;

            debug('processing: ' + fullPath);

            new re.InvokeRe(src).each(function(invoke) {
                if (!exports.templates[invoke.template()] && options(OPT_VALIDATE)) {
                    throw new errors.TemplateError("Unknown template: " + invoke.template());
                } else if (exports.templates[invoke.template()]) {
                    src = src.replace(invoke.match(),
                            exports.templates[invoke.template()](invoke.params(true)));
                }
            });

            src = applyMacros(src, re.MacroInvokeRe);

            if (options(OPT_VALIDATE)) {
                assertBody(src);
            }

            outDir = path.resolve(options(OPT_OUT) + SEP + child);
            mkdirs(outDir);

            if (optBeautify) {
                src = beautify(src, beautifyOpts);
            }

            fs.writeFileSync(outDir + SEP + file, src);

            debug('wrote file: ' + outDir + SEP + file);
            count++;
        }
    });
    console.log("Processed " + count + " files in "
            + (new Date().getTime() - start) + "ms");
};

function load(target) {
    var fullPath;
    visit(target, null, function(root, child, file) {
        fullPath = path.resolve(root + child + SEP + file);

        debug('load: ' + fullPath);

        loadTemplate(fs.readFileSync(fullPath, 'utf8'), fullPath);
    });
};

function validate() {
    var ids = Object.keys(templates),
        len = ids.length, unresolved = [];
    for (var i = 0; i < len; i++) {
        var template = templates[ids[i]];
        if (template.state !== RESOLVED) {
            unresolved.push(ids[i]);
        } else {
            template.state = ACTIVE;
        }
    }
    if (unresolved.length > 0) {
        throw new errors.TemplateError('Unresolved templates: ' + unresolved.join(','));
    }
    debug('all templates resolved');
};


function each(o, fn) {
    if (o instanceof Array) {
        var len = o.length;
        for (var i = 0; i < len; i++) {
            fn(o[i]);
        }
    } else {
        fn(o);
    }
};

// direct exports
exports.option = options;
exports.process = function() {
    var templates = options(OPT_TEMPLATES),
        src = options(OPT_SRC);

    if (options(OPT_DEBUG)) {
        env = 'debug';
    }

    // preprocess all templates
    each(templates, load);

    // resolve templates
    resolve();

    // conditional validation
    if (options(OPT_VALIDATE)) {
        validate();
    }

    // perform inlining
    each(src, processSrc);
};

