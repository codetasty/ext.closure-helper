define(function(require, exports, module) {
	var ExtensionManager = require('code/extensionManager');
	
	var Fn = require('code/fn');
	
	var EditorEditors = require('modules/editor/ext/editors');
	var EditorSession = require('modules/editor/ext/session');
	var EditorSplit = require('modules/editor/ext/split');
	
	var TokenIterator = require("ace/token_iterator").TokenIterator;
	
	var Extension = ExtensionManager.register({
		name: 'closure-compiler',
	}, {
		init: function() {
			var self = this;
			
			EditorSession.on('active', function(e) {
				if (self._modes.indexOf(e.session.mode) !== -1) {
					if (!e.session.data.editorHelper) {
						EditorEditors.session.helper(e.session.data, true);
					}
					
					Extension.getClosures(e.split, e.session.data);
				}
			});
			
			EditorEditors.on('codetools.cursorchange', function(e) {
				var storage = EditorSession.getStorage().sessions[e.fileId];
				var session = EditorSession.sessions[e.fileId];
				
				if (storage && session && storage.active) {
					if (self._modes.indexOf(session.mode) !== -1) {
						if (!session.data.editorHelper) {
							EditorEditors.session.helper(session.data, true);
						}
						
						Extension.getClosures(storage.split, session.data);
					}
				}
			});
		},
		_modes: ['less', 'scss'],
		getClosures: function(split, session) {
			var editor = EditorEditors.getEditor(split);
			var cursor = editor.getCursorPosition();
			
			var closure = [];
			var range;
			var iterator;
			var name;
			
			for (var i = 0; i <= cursor.row; i++) {
				if (session.foldWidgets && session.foldWidgets[i] == "start") {
					range = session.getFoldWidgetRange(i);
					
					if (!range) {
						continue;
					}
					
					if (range.start.row < cursor.row || range.start.column <= cursor.column) {
						if (range.end.row > cursor.row || (range.end.row == cursor.row && range.end.column >= cursor.column)) {
							name = '';
							iterator = new TokenIterator(session, range.start.row, range.start.column);
							while (token = iterator.stepBackward()) {
								if (token.type == "text" && token.value.match(/^\s+$/)) {
									continue;
								} else if (token.type == 'variable.language') {
									name = token.value + name;
								} else if (token.type == "text" && token.value.match(/^\s*\,\s*$/)) {
									name = ', ' + name;
								} else {
									closure.push({
										pos: range.start,
										name: name
									});
									break;
								}
							}
							
						}
					}
				}
			}
			
			var $helper = EditorSplit.getSplit(split).find('.editor-helper');
			
			$helper.html('<ul></ul>');
			
			if (closure.length) {
				closure.forEach(function(obj) {
					$item = $('<li></li>');
					
					$item.html(obj.name).data('pos', obj.pos);
					
					$item.click(function() {
						session.selection.moveCursorTo($(this).data('pos').row, $(this).data('pos').column);
						session.selection.clearSelection();
					});
					
					$helper.find('ul').append($item);
				});
			} else {
				$helper.find('ul').append('<li>Closure helper</li>');
			}
		},
		show: function(split) {
			
		},
		hide: function(split) {
			
		}
	});

	module.exports = Extension;
});