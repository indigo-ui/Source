'use strict';

var fs = require('fs-extra');
var ejs = require('ejs');
var _ = require('lodash');
var path = require('path');
var viewResolver = require(path.join(global.pathToApp + '/core/lib/viewResolver.js'));
var getHeaderAndFooter = require(global.pathToApp + '/core/headerFooter.js').getHeaderAndFooter;
var specUtils = require(path.join(global.pathToApp,'core/lib/specUtils'));
var cheerio = require('cheerio');

/**
 * Wrap rendered html from request with spec wrapper (header, footer, etc.)
 *
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - The callback function
 * */
exports.process = function (req, res, next) {

    // Check if we're working with processed file
    if (req.specData && req.specData.renderedHtml) {
        var specDir = specUtils.getFullPathToSpec(req.url);
        var contextOptions = req.specData.contextOptions;

        // get spec content
        var data = req.specData.renderedHtml.replace(/^\s+|\s+$/g, '');

        // get spec info
        var info = req.specData.info;

        // choose the proper template, depending on page type or defined path
        var viewParam = 'spec';
        var context;

        if (info.template) {
            viewParam = info.template;
            context = specDir;
        } else if (info.role === 'navigation') {
            viewParam = 'navigation';
        }

        var templatePath = viewResolver(viewParam, contextOptions.rendering.views, context) || viewParam;

        fs.readFile(templatePath, "utf-8", function(err, template){
            if (err) {
                res.send('EJS template "' + templatePath + '" not found. Please check view configuration.');

                return;
            }

            var $ = cheerio.load(data, {decodeEntities: false});

            var head = '';
            var $headHook = $('head');

            if ($headHook.length > 0) {
                head = $headHook.html();

                $('head').remove();
            }

            var content = '';
            var $body = $('body');
            var $html = $('html');

            if ($body.length > 0) {
                content = $body.html();
            } else if ($html.length > 0) {
                content = $html.html();
            } else {
                content = $.html();
            }

            var heagerFooter = getHeaderAndFooter();

            // final data object for the template
            var templateJSON = {
                engineVersion: global.engineVersion,
                content: content,
                head: head,
                info: info,
                filename: templatePath
            };

            try {
                templateJSON.header = ejs.render(heagerFooter.header, _.merge({}, templateJSON, {
                    filename: heagerFooter.headerPath
                }));
            } catch(err){
                var headerMsg = 'Error: EJS could render header template: ' + heagerFooter.headerPath;
                templateJSON.header = headerMsg;
                global.log.warn(headerMsg, err.stack);
            }

            try {
                templateJSON.footer = ejs.render(heagerFooter.footer, _.merge({}, templateJSON, {
                    filename: heagerFooter.footerPath
                }));
            } catch(err){
                var footerMsg = 'Error: EJS could render footer template: ' + heagerFooter.footerPath;
                templateJSON.footer = footerMsg;
                global.log.warn(footerMsg, err.stack);
            }

            // render page and send it as response
            try {
                req.specData.renderedHtml = ejs.render(template, templateJSON);
            } catch(err){
                req.specData.renderedHtml = 'Error rendering Spec with EJS: ' + template;
            }


            req.specData.renderedHtml += '\n<!-- SourceJS version: ' + global.engineVersion + ' -->';

            next();
        });
    } else {
        // proceed to next middleware
        next();
    }
};