#!/usr/bin/env node

'use strict';
const arrify = require('arrify');
const meow = require('meow');
const getStdin = require('get-stdin');
const imagemin = require('./imagemin');
const ora = require('ora');
const plur = require('plur');
const stripIndent = require('strip-indent');

const cli = meow(`
	Usage
	  $ imagemin <path|glob> ... --out-dir=build [--plugin=<name> ...]
	  $ imagemin <file> > <output>
	  $ cat <file> | imagemin > <output>

	Options
	  -p, --plugin   Override the default plugins
	  -o, --out-dir  Output directory
	  -w, --overwrite overwrite the file, default false

	Examples
	  $ imagemin images/* --out-dir=build
	  $ imagemin foo.png > foo-optimized.png
	  $ cat foo.png | imagemin > foo-optimized.png
	  $ imagemin --plugin=pngquant foo.png > foo-optimized.png
`, {
    flags: {
        plugin: {
            type: 'string',
            alias: 'p',
        },
        outDir: {
            type: 'string',
            alias: 'o',
        },
        overwrite: {
            type: 'boolean',
            alias: 'w',
        }
    }
});

const DEFAULT_PLUGINS = [
    'gifsicle',
    'mozjpeg',
    'pngquant',
    // 'optipng',
    'svgo'
];

const requirePlugins = plugins => plugins.map(x => {
    try {
        return require(`imagemin-${x}`)();
    } catch (err) {
        try {
            return require(`./imagemin-${x}`)();
        } catch (err) {
            console.error(stripIndent(`
				Unknown plugin: ${x}

				Did you forget to install the plugin?
				You can install it with:

				$ npm install -g imagemin-${x}
			`).trim());
            process.exit(1);
        }
    }
});

const run = (input, opts) => {
    opts = Object.assign({
        plugin: DEFAULT_PLUGINS,
        overwrite: false
    }, opts);

    const use = requirePlugins(arrify(opts.plugin));
    const spinner = ora('Minifying images');

    if (Buffer.isBuffer(input)) {
        imagemin.buffer(input, {
            use
        }).then(buf => process.stdout.write(buf));
        return;
    }

    if (opts.overwrite) {
        opts.outDir = 'overwrite';
    }

    if (opts.outDir || opts.overwrite) {
        spinner.start();
    }

    imagemin(input, opts.outDir, {
            use: use,
            overwrite: opts.overwrite
        })
        .then(files => {
            if (!opts.outDir && files.length === 0) {
                return;
            }

            if (!opts.outDir && files.length > 1) {
                console.error('Cannot write multiple files to stdout, specify a `--out-dir`');
                process.exit(1);
            }

            if (!opts.outDir) {
                process.stdout.write(files[0].data);
                return;
            }

            spinner.stop();

            console.log(`${files.length} ${plur('image', files.length)} minified`);
        })
        .catch(err => {
            spinner.stop();
            throw err;
        });
};

if (cli.input.length === 0 && process.stdin.isTTY) {
    console.error('Specify at least one filename');
    process.exit(1);
}

if (cli.input.length > 0) {
    run(cli.input, cli.flags);
} else {
    getStdin.buffer().then(buf => run(buf, cli.flags));
}