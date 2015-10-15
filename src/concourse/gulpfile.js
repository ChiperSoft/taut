/* eslint max-len: 0, strict:0, no-console:0 */

var pkg          = require('./package.json');

var forever      = require('forever-monitor');
var gulp         = require('gulp');
var gutil        = require('gulp-util');
var sequence     = require('run-sequence');
var merge        = require('merge-stream');
var concat       = require('gulp-concat-util');
var insert       = require('gulp-insert');
var scss         = require('gulp-sass');
var minifyCSS    = require('gulp-minify-css');
var uglify       = require('gulp-uglify');
var clone        = require('gulp-clone');
var rename       = require('gulp-rename');
var requirejs    = require('requirejs');
var del          = require('del');
var jscs         = require('gulp-jscs');
var eslint       = require('gulp-eslint');
var defineModule = require('gulp-define-module');
var handlebars   = require('gulp-handlebars');
var jquery       = require('gulp-jquery');
var rev          = require('gulp-rev');
var revOverride  = require('gulp-rev-css-url');
var browserify   = require('gulp-browserify');

var fs           = require('fs');
var exec         = require('child_process').exec;
var through2     = require('through2');
var path         = require('path');

// var debug = through2.obj(function (file, enc, next) {
// 	console.log(require('util')._extend({path: file.path, relative: file.relative}, file));
// 	this.push(file);
// 	next();
// });

/**
 * Runs all JS files through jscs and jshint.
 */
gulp.task('lint-js', function () {
	var files = gulp.src([
		'app.js',
		'bin/www',
		'gulpfile.js',
		'app/**/*.js',
		'public/components/**/*.js',
		'!**/*.hbs.js',
	]);

	return merge(
		files.pipe(jscs({
			configPath: '../.jscsrc'
		})),
		files.pipe(eslint())
			.pipe(eslint.format())
	);
});

/**
 * Deletes all files generated by gulp processes
 */
gulp.task('clean', function (cb) {
	var targets = [
		'coverage',
		'app/rev-manifest.json',
		'app/views/**/*.hbs.js',
		'public/rev',
		'public/vendor',
		'public/build',
		'public/views/**/*.hbs.js',
		'public/components/**/*.hbs.js',
		'public/assets/binary-sorted-set.js',
		'public/assets/chatview/templates.js'
	];
	del(targets).then(function () {cb();});
});

gulp.task('clean-rev', function (cb) {
	var targets = [
		'app/rev-manifest.json',
		'public/rev'
	];
	del(targets).then(function () {cb();});
});

/**
 * Generates a custom lodash build with backbone requirements plus other desired functions, compiled for AMD
 */
gulp.task('lodash', function (cb) {
	exec('./node_modules/.bin/lodash modern exports=amd include="bind,bindAll,clone,contains,countBy,defaults,difference,escape,every,extend,filter,find,first,forEach,groupBy,has,indexOf,initial,invert,invoke,isArray,isEmpty,isEqual,isFunction,isObject,isRegExp,isString,keys,last,lastIndexOf,map,max,min,mixin,omit,once,pairs,pick,reduce,reduceRight,reject,rest,result,shuffle,size,some,sortBy,sortedIndex,toArray,uniqueId,value,values,without" plus="cloneDeep,curry,debounce,flatten,findIndex,intersection,isPlainObject,mapValues" -d -o "public/vendor/lodash.custom.js"', cb);
});

gulp.task('jquery', function () {
	return jquery.src({
		flags: ['-deprecated', '-event/alias', '-ajax/script', '-ajax/jsonp', '-exports/global']
	})
	.pipe(gulp.dest('./public/vendor/'));
});

/**
 * Copies our NPM installed front-end libs into the public folder
 * This is so that we're not exposing all our dependencies to the public.
 */
gulp.task('vendor', ['browserify', 'jquery', 'lodash'], function () {
	var libs = [
		'backbone',
		'requirejs',
		'bluebird',
		'handlebars',
		'helper-hoard',
		'moment'
	].map(function (s) {return './node_modules/' + s + '/**/*.*';});

	libs.push('./node_modules/bootbox/bootbox.js');

	var sources = [
		gulp.src(libs, { base: './node_modules' }),
		gulp.src('./node_modules/socket.io-client/socket.io.js', { base: './node_modules/socket.io-client' }),
		gulp.src('./node_modules/bootstrap/dist/js/umd/*.js', { base: './node_modules/bootstrap/dist/js/umd/' })
			.pipe(rename(function (fpath) {
				fpath.basename = path.join('bootstrap', fpath.basename);
			}))
	];

	return merge.apply(null, sources)
		.pipe(gulp.dest('public/vendor'));
});

gulp.task('browserify', function () {
	gulp.src('./node_modules/binary-sorted-set/index.js')
		.pipe(browserify({
			standalone: 'binary-sorted-set',
			debug: true
		}))
		.pipe(rename('binary-sorted-set.js'))
		.pipe(gulp.dest('public/assets'));
});

/**
 * Copies the font-awesome fonts to a public vendor folder.
 * FA css is generated as part of our LESS stack, so we only need the font files.
 */
gulp.task('fontawesome', function () {
	return gulp.src('./node_modules/font-awesome/fonts/*.*')
		.pipe(gulp.dest('public/vendor/font-awesome'));
});

/**
 * Writes out the package.json version number to an amd loadable file.
 */
gulp.task('amd-version', function (cb) {
	var contents = "define(function () {\n\treturn '" + pkg.version + "';\n});\n";
	var target = path.join(__dirname, 'public/build/version.js');
	fs.mkdir(path.dirname(target), function () {
		fs.writeFile(target, contents, cb);
	});
});


gulp.task('chatview-templates', function () {
	var templates = {};
	return gulp.src('./public/assets/chatview/templates/**/*.hbs')
		.pipe(through2.obj(function (file, enc, done) {
			templates[path.basename(file.path, path.extname(file.path))] = file.contents.toString();
			done();
		}, function (done) {
			this.push(new gutil.File({
				path: 'templates.js',
				contents: new Buffer(JSON.stringify(templates, null, 2))
			}));
			done();
		}))
		.pipe(defineModule('hybrid'))
		.pipe(gulp.dest('./public/assets/chatview/'));
});

/**
 * Compile all RequireJS dependencies into a single file and minify.
 * Uses gulp-clone to split the rjs output into two streams so we get both minified and plain.
 */
gulp.task('requirejs', ['requirejs-main', 'requirejs-pages']);

gulp.task('requirejs-main', function () {
	var files = gulp.src('./requirejs/main.js')
		.pipe(through2.obj(function (file, enc, done) {
			var self = this;

			var base = path.resolve(file.cwd, './public/assets');
			var name = path.relative(base, file.path);
			name = path.join(path.dirname(name), path.basename(name, path.extname(name)));

			var options = {
				mainConfigFile: 'requirejs/_config.js',
				baseUrl: 'public/assets/',
				preserveLicenseComments: false,
				name: name,
				allowSourceOverwrites: true,
				optimize: 'none',
				out: function (output) {
					file.contents = new Buffer(output);
					self.push(file);
				}
			};

			requirejs.optimize(options, function () {done();}, function (err) {
				self.emit('error', err);
			});
		}));

	return merge(
		// minified
		files
			.pipe(clone())
			.pipe(uglify()),

		// original
		files
			.pipe(clone())
			.pipe(rename(function (fpath) {
				fpath.basename += '.max';
			}))
	).pipe(gulp.dest('./public/build/'));
});

gulp.task('requirejs-pages', function () {
	var files = gulp.src(['./requirejs/**/*.js', '!./requirejs/main.js', '!./requirejs/_config.js'])
		.pipe(through2.obj(function (file, enc, done) {
			var self = this;

			var base = path.resolve(file.cwd, './public/assets');
			var name = path.relative(base, file.path);
			name = path.join(path.dirname(name), path.basename(name, path.extname(name)));

			var options = {
				mainConfigFile: 'requirejs/_config.js',
				baseUrl: 'public/assets/',
				preserveLicenseComments: false,
				name: name,
				allowSourceOverwrites: true,
				optimize: 'none',
				exclude: ['../../requirejs/main'],
				out: function (output) {
					file.contents = new Buffer(output);
					self.push(file);
				}
			};

			requirejs.optimize(options, function () {
				done();
			}, function (err) {
				console.error(arguments);
				self.emit('error', err);
			});
		}));

	return merge(
		// minified
		files
			.pipe(clone())
			.pipe(uglify()),

		// original
		files
			.pipe(clone())
			.pipe(rename(function (fpath) {
				fpath.basename += '.max';
			}))
	).pipe(gulp.dest('./public/build/pages/'));
});


/*
	Development requirejs stubs for use in gulp watch process.
	requirejs-main-dev creates an unminified concatination of the main.js file containing only requirejs, config and the main rjs module.
	requirejs-pages-dev copies the page optimization modules, so that we don't get 404 errors during dev.
 */
gulp.task('requirejs-dev', ['requirejs-main-dev', 'requirejs-pages-dev']);

gulp.task('requirejs-main-dev', function () {
	return gulp.src(['./public/vendor/requirejs/require.js', './requirejs/_config.js', './requirejs/main.js'])
		.pipe(concat('main.js'))
		.pipe(gulp.dest('./public/build/'));
});

gulp.task('requirejs-pages-dev', function () {
	return gulp.src(['./requirejs/**/*.js', '!./requirejs/main.js', '!./requirejs/_config.js'])
		.pipe(gulp.dest('./public/build/pages'));
});



/**
 * Compile the main site level LESS file into a CSS file and minify
 * Uses gulp-clone to split the LESS output into two streams so we get both minified and plain.
 */
gulp.task('scss-main', function () {
	var files = gulp.src('./scss/main.scss')
		.pipe(insert.prepend('$env: "production";\n'))
		.pipe(scss());

	return merge(
		// original
		files.pipe(clone())
			.pipe(rename(function (fpath) {
				fpath.basename += '.max';
			})),

		// minified
		files.pipe(clone())
			.pipe(minifyCSS())
	).pipe(gulp.dest('public/build/'));
});

/**
 * Compile the page site level LESS files into a CSS file and minify
 * Uses gulp-clone to split the LESS output into two streams so we get both minified and plain.
 */
gulp.task('scss-pages', function () {
	var files = gulp.src('./scss/pages/**/*.scss')
		.pipe(insert.prepend('$env: "production";\n'))
		.pipe(scss());

	return merge(
		// original
		files.pipe(clone())
			.pipe(rename(function (fpath) {
				fpath.basename += '.max';
			})),

		// minified
		files.pipe(clone())
			.pipe(minifyCSS())
	).pipe(gulp.dest('public/build/pages'));
});

gulp.task('scss', ['scss-main', 'scss-pages']);

/**
 * Compile the main site level LESS file, concatenated with all component styles
 */
gulp.task('scss-main-dev', function () {
	return gulp.src(['./scss/main.scss', 'public/components/**/main.scss'])
		.pipe(concat('main.scss'))
		.pipe(insert.prepend('$env: "development";\n'))
		.pipe(scss())
		.pipe(gulp.dest('public/build/'));
});

/**
 * Compile the page level LESS files, concatenated with all component styles
 */
gulp.task('scss-pages-dev', function () {
	return gulp.src('./scss/pages/**/*.scss')
		.pipe(insert.prepend('$env: "development";\n'))
		.pipe(scss())
		.pipe(gulp.dest('public/build/pages'));
});

gulp.task('scss-dev', ['scss-main-dev', 'scss-pages-dev']);

// Backend templates
gulp.task('views-be', function () {
	return gulp.src(['app/views/**/*.hbs.html', 'app/views/**/*.hbs'])
		.pipe(handlebars({ handlebars: require('handlebars') }))
		.pipe(defineModule('commonjs'))
		.pipe(rename(function (fpath) {
			if (fpath.basename.indexOf('.hbs') === -1) fpath.basename += '.hbs';
		}))
		.pipe(gulp.dest('app/views/'));
});

// Frontend templates
gulp.task('views-fe', function () {
	return gulp.src(['public/views/**/*.hbs.html', 'public/views/**/*.hbs'])
		.pipe(handlebars({ handlebars: require('handlebars') }))
		.pipe(defineModule('hybrid', { require: { Handlebars: 'handlebars' } }))
		.pipe(rename(function (fpath) {
			if (fpath.basename.indexOf('.hbs') === -1) fpath.basename += '.hbs';
		}))
		.pipe(gulp.dest('public/views/'));
});

// Component Templates
gulp.task('views-components', function () {
	return gulp.src(['public/components/**/*.hbs'])
		.pipe(handlebars({ handlebars: require('handlebars') }))
		.pipe(defineModule('hybrid', { require: { Handlebars: 'handlebars' } }))
		.pipe(rename(function (fpath) {
			if (fpath.basename.indexOf('.hbs') === -1) fpath.basename += '.hbs';
		}))
		.pipe(gulp.dest('public/components/'));
});

gulp.task('views', ['views-be', 'views-fe', 'views-components']);


gulp.task('rev', function () {
	return gulp.src([
		'public/build/**/*.*',
		'public/assets/images/**/*.*',
		'!public/build/**/*.max.*'
	])
		.pipe(rev())
		.pipe(through2.obj(function (file, enc, next) {
			// gulp-rev doesn't support defining a path prefix for its output, so we have to
			// trick it into putting the full public url.

			// Change rev's original base path to the public root so that it uses the full public
			// path as the original file name key in the manifest, as well as in css substitution
			file.revOrigBase = path.join(__dirname, '/public');

			// Change rev's target path to include /rev before the paths.
			file.path = file.path.replace(path.join(__dirname, '/public'), path.join(__dirname, '/public/rev'));
			file.base = path.join(__dirname, '/public');

			this.push(file);
			next();
		}))
		.pipe(revOverride())

		// have to write out to public root because /rev is now appended to all file urls.
		.pipe(gulp.dest('public'))

		// manifest can be saved normally
		.pipe(rev.manifest('rev-manifest.json'))
		.pipe(gulp.dest('app'));
});

/**
 * Watch task. Updates LESS builds and launches the server.
 * Uses forever to restart server on changes.
 */
gulp.task('watch', ['clean-rev', 'requirejs-dev', 'scss-dev', 'chatview-templates', 'views', 'amd-version'], function () {
	var server = new forever.Monitor('bin/taut-concourse', {
		env: { DEBUG_COLORS:1 },
		killSignal: 'SIGUSR2',
		watch: false
	});

	gulp.watch(['./public/assets/chatview/templates/**/*.hbs'], ['chatview-templates']);
	gulp.watch(['./scss/variables.scss', './scss/mixins.scss'], ['scss-dev']);
	gulp.watch(['./scss/*.scss', '!./scss/variables.scss', '!./scss/mixins.scss', './public/components/**/main.scss'], ['scss-main-dev', 'scss-pages-dev']);
	gulp.watch(['./scss/pages/**/*.scss'], ['scss-pages-dev']);
	gulp.watch(['./requirejs/_config.js'], ['requirejs-dev']);
	gulp.watch(['./requirejs/**/*.js', '!./requirejs/_config.js'], ['requirejs-pages-dev']);
	gulp.watch(['./public/components/**/*.hbs'], ['views-components']);
	gulp.watch(['./public/views/**/*.hbs.html', './public/views/**/*.hbs'], ['views-fe']);
	gulp.watch(['./app/views/**/*.hbs.html', './app/views/**/*.hbs'], ['views-be']);

	gulp.watch([
		'./app/**/*.js',
		'./io/**/*.js',
		'./controllers/**/*.js',
		'./bin/**/*',
		'./public/assets/chatview/index.js',
		'./public/assets/chatview/templates.json',
		// './public/components/**/*.js',
		'./public/components/**/*.hbs.js'
	], function (change) {
		console.log(change.path, 'changed.');
		server.restart();
	});

	server.start();
});


gulp.task('live', ['default'], function () {
	new forever.Monitor('bin/taut-concourse', {
		env: { DEBUG_COLORS:1, NODE_ENV: 'production' },
		killSignal: 'SIGUSR2',
		watch: false
	}).start();
});

/**
 * Default gulp task.
 * Due to multiple dependencies, we use run-sequence to do things in a proper order.
 */
gulp.task('default', function (cb) {
	sequence(
		'lint-js',
		'clean',
		[
			'scss',
			'vendor',
			'fontawesome',
			'views',
			'chatview-templates',
			'amd-version'
		],
		'requirejs',
		'rev',
		cb
	);
});
