# inlay

A [node.js](http://nodejs.org) module for creating and inlining JavaScript 
source code templates.

## Installation

Install using `npm`:
```
npm install inlay
```

## Running the examples

The module includes a very basic sample which can be preprocessed using:
```
cd inlay/examples/basic
../../bin/inlay
```

The resulting JS source is now under `./lib` and you can run it using:
```
node ./lib/basic.js
```


## Status

Experimental - functional, but a work in progress. Hence no jsdocs or detailed
user documentation. APIs are subject to change.

## Defining templates

Templates are JavaScript with some template specific constructs and are used
to define JS which can be inlined into your source code.

Inlay template files end with the `.jst` (Java Script Template) extension 
and are typically (but not required) isolated in their own root directory structure. 

Templates are defined using the `exports.NAME = function(/* args.. */) {/* body */}` 
syntax. The arguments to templates must be explicitly defined -- that is, don't use
argless functions and try to reference the args using the `arguments[#]`
syntax -- the preprocessor isn't that smart.

Keep in mind that the body you define is JS source which will be inlined. 
As such the arguments to your template may be snippets of JS code.

The inlay template system uses 2 special symbols:

`@NAME(args)` -- The `@` to invoke the template named `NAME` with the given arguments.
Note that the template invocation symbol (`@` by default) can be specified via the
CLI.
`${arg}` -- The `${}` to expand a template argument.

Templates can reference other templates -- the preprocessor will resolve the
dependencies for you. This allows you to reuse templates in other templates.

Example templates:
```js
exports.DEBUG = function(msg) {
    if (process.env.NODE_ENV === 'debug') {
        console.log(${msg});
    }
};

exports.EXISTS = function(x) {
    ${x} !== null && ${x} !== undefined
};

exports.LOG_EXISTS = function(y) {
    if (@EXISTS(${y})) {
        console.log("Yes, " + ${y} + " does exist");
    } else {
        console.log("No, " + ${y} + " does not exist");
    }
};
```

## Defining Macros

Inlay also supports the notion of macros. Macros are similar to templates, however
instead of defining source to be inlined, they define actual JS functions which 
which are called and their resulting return value is used in the templating system.

Macros are defined within your `.jst` files, and must be exported under a sub-object
named `macros`.

For example, suppose you want to define a macro which returns the current date
string and use that to provide a source header comment to indicate the last
time a source file was generated.

To do so you could define the following macro in your `.jst`:

```js
exports.macros = {};
exports.macros.DATE = function() {
    return new Date().toString();
};
```

Then you can use the macro in your source (or in a template itself) as follows:
```js
// Last generated on $$DATE()
```

By default the macro invocation token is `$$`, but this value can be overridden on 
the CLI.

As mentioned previously, macros can be used in your JS source, in arguments to
template invocations and also within template definitions themselves.

## Using templates in your source

To use a template in your JS source, use the `@TEMPLATE_NAME` syntax.

For example if you have a template named `THE_TEMPLATE` you can use it in 
your JS as follows:
```js
//...
@THE_TEMPLATE(arg1, arg2 /* etc */)
//...
```


## The inlay command

The module includes a binary which is packaged under the `/bin` directory
of the module which can be used for invoking `inlay` from the command line.

It supports the following options:
```
  Usage: inlay [options]

  Options:

    -h, --help                output usage information
    -V, --version             output the version number
    -s, --source <path>       source path to process [./src]
    -o, --output <path>       output path [./lib]
    -t, --templates <path>    template path [./templates]
    -v, --validate <on>       validate templates and source [true]
    -b, --beautify <options>  js-beautify code with options [{}]
    -i, --invoke <token>      template invocation token [@]
    -m, --macro <token>       macro invocation token [$$]
    -d, --debug [on]          debug verbose output [false]
```

Example usage...

Preprocess all sources under `./src` using the templates under `./templates` and output
the resulting JS under `./lib`:
```
inlay
```

The same as the above, but print debug info to the console:
```
inlay -d
```

Same as above, but use `_$` as the template invocation token and `__` as the
macro invocation token:
```
inlay -d -i _$ -m __
```

Same as above, but don't validate the resulting js:
```
inlay -d -v false
```

Preprocess all sources under `./js` using the templates under `./inline` and
output the resulting JS under `./js-bin`:
```
inlay -s ./js -t ./inline -o ./js-bin
```

## License

(The MIT License)

Copyright (c) 2012 Boden Russell &lt;bodensemail@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

