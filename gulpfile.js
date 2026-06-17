'use strict';

const gulp = require('gulp');
const build = require('@microsoft/sp-build-web');

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

// Disable the tslint subtask: SPFx 1.4.1's bundled tslint throws a fatal
// "Invalid source file ... ensure files have a .ts extension" on Windows when the
// drive-letter casing differs (c:\ vs C:\). Linting does not affect the produced
// bundle, and code quality is enforced via the standalone Jest suite + CI instead.
build.tslint.enabled = false;

// TinyMCE ships its own CSS/skin that the SPFx module loader does not need to type-check
build.configureWebpack.mergeConfig({
  additionalConfiguration: (generatedConfiguration) => {
    return generatedConfiguration;
  }
});

build.initialize(gulp);
