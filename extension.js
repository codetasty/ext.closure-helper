define(function(require, exports, module) {
	var ExtensionManager = require('code/extensionManager');
	
	var Fn = require('code/fn');
	
	var EditorEditors = require('modules/editor/ext/editors');
	var EditorSession = require('modules/editor/ext/session');
	var EditorSplit = require('modules/editor/ext/split');
	
	var TokenIterator = require("ace/token_iterator").TokenIterator;
	
	var Extension = ExtensionManager.register({
		name: 'closure-helper',
	}, {
		init: function() {
			var self = this;
			
			EditorSession.on('active', function(e) {
				if (self._modes.indexOf(e.session.mode) !== -1) {
					if (!e.session.data.editorHelper) {
						EditorEditors.session.helper(e.session.data, true);
					}
					
					Extension.getClosures(e.split, e.session.data, e.session.mode);
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
						
						Extension.deffer('closures', function() {
							Extension.getClosures(storage.split, session.data, session.mode);
						}, 200);
					}
				}
			});
		},
		_modes: ['less', 'scss', 'html', 'php'],
		_checking: false,
		detector: {
			less: function(editor, cursor, session) {
				var closure = [];
				var range;
				var iterator;
				var name;
				var ended;
				
				if (!session || !session.foldWidgets) {
					return closure;
				}
				
				for (var i = 0; i <= cursor.row; i++) {
					if (session.foldWidgets[i] === "") {
						continue;
					}
					
					range = session.getFoldWidgetRange(i);
					if (!range) {
						continue;
					}
					
					if (range.start.row < cursor.row || (range.start.row == cursor.row && range.start.column <= cursor.column)) {
						if (range.end.row > cursor.row || (range.end.row == cursor.row && range.end.column >= cursor.column)) {
							name = '';
							iterator = new TokenIterator(session, range.start.row, range.start.column);
							ended = false;
							
							var inParen = 0;
							
							while (token = iterator.stepBackward()) {
								if (token.type == "text" && token.value.match(/^\s+$/)) {
									name = ' ' + name;
								} else if (token.type == 'variable.language') {
									name = token.value + name;
								} else if (token.type == 'identifier') {
									name = token.value + name;
								} else if (token.type == "text" && !token.value.match(/\;/) && !token.value.match(/(\{|\})/)) {
									trimmed = $.trim(token.value) == ',' ? ', ' : token.value;
									name = trimmed + name;
								} else if (['keyword', 'keyword.operator', 'variable', 'string', 'constant.numeric', 'support.type.unknownProperty', 'support.function'].indexOf(token.type) !== -1) {
									name = token.value + name;
								} else if ((token.type == "paren.lparen" && token.value.trim() != '{') || (token.type == "paren.rparen" && token.value.trim() != '}')) {
									inParen += token.value == ')' || token.value == ']' ? 1 : -1;
									name = token.value + name;
								} else if (inParen > 0) {
									name = token.value + name;
								} else {
									closure.push({
										pos: range.start,
										name: $.trim(name)
									});
									ended = true;
									break;
								}
							}
							
							if (!ended) {
								closure.push({
									pos: range.start,
									name: $.trim(name)
								});
							}
						} else {
							i = range.end.row;
						}
					}
				}
				
				return closure;
			},
			scss: function() {
				return this.less.apply(this, arguments);
			},
			_htmlVoidTags: ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'],
			html: function(editor, cursor, session) {
				var closure = [];
				var closed = [];
				var token = null;
				var lastClass = null;
				var tag = null;
				
				var iterator = new TokenIterator(session, cursor.row, cursor.column);
				
				while (token = iterator.stepBackward()) {
					if (token.type == 'string.attribute-value.xml') {
						iterator.stepBackward();
						
						if (iterator.stepBackward().value == 'class') {
							lastClass = token.value.replace(/(\'|\")/gi, '');
						}
					}
					
					if (token.type != 'meta.tag.tag-name.xml') {
						continue;
					}
					
					if (token.value == 'body' || token.value == 'html') {
						break;
					}
					
					if (this._htmlVoidTags.indexOf(token.value.toLowerCase()) !== -1) {
						continue;
					}
					
					if (iterator.stepBackward().type == 'meta.tag.punctuation.end-tag-open.xml') {
						closed.push(token.value);
					} else {
						if (closed.length && closed[closed.length-1] == token.value) {
							closed.pop();
						} else {
							var tag = $.trim(token.value);
							
							closure.push({
								pos: {
									row: iterator.getCurrentTokenRow(),
									column: 0
								},
								name: (tag == 'div' && lastClass ? '' : tag) + (lastClass ? '.' + lastClass : '')
							});
						}
					}
					
					lastClass = null;
				}
				
				
				return closure.reverse();
			},
			php: function() {
				return this.html.apply(this, arguments);
			}
		},
		getClosures: function(split, session, mode) {
			this.clearDeffer('closures');
			
			if (this._checking || !session) {
				return false;
			}
			
			this._checking = true;
			
			var editor = EditorEditors.getEditor(split);
			var cursor = editor.getCursorPosition();
			
			var closure = this.detector[mode](editor, cursor, session);
			
			var $helper = EditorSplit.getSplit(split).find('.editor-helper');
			
			$helper.html('<ul></ul>');
			
			if (closure.length) {
				closure.forEach(function(obj) {
					$item = $('<li></li>');
					
					$item.html(obj.name + " ").data('pos', obj.pos); //add space if user selects tree
					
					$item.click(function() {
						session.selection.moveCursorTo($(this).data('pos').row, $(this).data('pos').column);
						session.selection.clearSelection();
						editor.scrollToLine($(this).data('pos').row, false,  true);
					});
					
					$helper.find('ul').append($item);
				});
			} else {
				$helper.find('ul').append('<li>Closure helper</li>');
			}
			
			this._checking = false;
		}
	});

	module.exports = Extension;
});