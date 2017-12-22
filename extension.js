/* global define, $ */
"use strict";

define(function(require, exports, module) {
	const ExtensionManager = require('core/extensionManager');
	
	const Fn = require('core/fn');
	
	const Editor = require('modules/editor/editor');
	const EditorEditors = require('modules/editor/ext/editors');
	const EditorSession = require('modules/editor/ext/session');
	const EditorSplit = require('modules/editor/ext/split');
	
	const TokenIterator = require("ace/token_iterator").TokenIterator;
	
	class Extension extends ExtensionManager.Extension {
		constructor() {
			super({
				name: 'closure-helper',
			});
			
			this._defferSession = null;
			this._modes = ['less', 'scss', 'html', 'php', 'javascript'];
			this._checking = false;
			
			this._htmlVoidTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
			
			this.onSessionFocus = this.onSessionFocus.bind(this);
			this.onSessionClose = this.onSessionClose.bind(this);
			this.onCursorChange = this.onCursorChange.bind(this);
		}
		
		init() {
			super.init();
			
			var self = this;
			
			EditorSession.on('focus', this.onSessionFocus);
			EditorSession.on('close', this.onSessionClose);
			EditorEditors.on('session.changeCursor', this.onCursorChange);
		}
		
		destroy() {
			super.destroy();
			
			EditorSession.off('focus', this.onSessionFocus);
			EditorSession.off('close', this.onSessionClose);
			EditorEditors.off('session.changeCursor', this.onCursorChange);
		}
		
		onSessionFocus(session) {
			if (this._modes.indexOf(session.mode) !== -1) {
				this._defferSession = session.id;
				this.deffer('closures', () => {
					this.getClosures(session);
				}, 200);
			}
		}
		
		onCursorChange(session, cursor) {
			if (!session.isFocus) {
				return;
			}
			
			if (this._modes.indexOf(session.mode) !== -1) {
				this._defferSession = session.id;
				this.deffer('closures', () => {
					this.getClosures(session);
				}, 200);
			}
		}
		
		onSessionClose(session) {
			if (this._defferSession === session.id) {
				this.clearDeffer('closures');
			}
		}
		
		detectorLess(editor, cursor, session) {
			var closure = [];
			var range;
			var iterator;
			var name = '';
			var ended;
			let token;
			
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
								let trimmed = String(token.value).trim() == ',' ? ', ' : token.value;
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
									name: name.trim()
								});
								ended = true;
								break;
							}
						}
						
						if (!ended) {
							closure.push({
								pos: range.start,
								name: name.trim()
							});
						}
					} else {
						i = range.end.row;
					}
				}
			}
			
			return closure;
		}
		
		detectorScss(...args) {
			return this.detectorLess(...args);
		}
		
		detectorHtml(editor, cursor, session) {
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
				
				if (token.type != 'meta.tag.tag-name.xml' && token.type != 'meta.tag.anchor.tag-name.xml') {
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
						tag = String(token.value).trim();
						
						if (tag == 'svg') {
							closure = [];
						}
						
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
		}
		
		detectorPhp(...args) {
			return this.detectorHtml(...args);
		}
		
		detectorJavascript(editor, cursor, session) {
			var closure = [];
			var range;
			var iterator;
			var name;
			var ended;
			let token;
			
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
						var possibleTotal = 20;
						var possible = possibleTotal;
						var isNameNext = false;
						var isVariable = false;
						var isProperty = false;
						var closedParens = false;
						var nextMustType = null;
						
						while (token = iterator.stepBackward()) {
							if (!possible) {
								break;
							}
							
							if (token.type == 'punctuation.operator' && (token.value == ';' || token.value == ',')) {
								break;
							} else if (isNameNext && token.type != 'text') {
								if (nextMustType && nextMustType != token.type) {
									break;
								}
								
								name = token.value + (token.type == 'entity.name.function' ? '()' : '') + name;
								
								if (isVariable) {
									name = 'var ' + name;
								} else if (isProperty) {
									name = '.' + name;
								}
								
								if (token.type != 'punctuation.operator') {
									nextMustType = 'punctuation.operator';
								} else {
									nextMustType = null;
								}
							} else if (token.type == 'punctuation.operator' && token.value == ':') {
								isNameNext = true;
								isProperty = true;
							} else if (token.type == 'keyword.operator' && token.value == '=') {
								isNameNext = true;
								isVariable = true;
							} else if (token.type == "paren.lparen" || token.type == "paren.rparen") {
								inParen += token.value == ')' || token.value == ']' || token.value == '}' ? 1 : -1;
								
								if (inParen === 0) {
									closedParens = true;
								}
								
								if (token.value == '(' && possible == possibleTotal) {
									isNameNext = true;
								}
							} else if (token.type == 'keyword' && closedParens) {
								isNameNext = true;
								iterator.stepForward();
							} else if (token.type == 'identifier' && possible == possibleTotal) {
								name = token.value + '()';
								isNameNext = true;
							}
							
							if (token.type != 'text') {
								possible--;
							}
						}
						
						if (!ended && name) {
							closure.push({
								pos: range.start,
								name: name
							});
						}
					} else {
						i = range.end.row;
					}
				}
			}
			
			return closure;
		}
		
		getClosures(session) {
			this.clearDeffer('closures');
			
			if (this._checking || !session || !session.isFocus || !session.editor) {
				return;
			}
			
			this._checking = true;
			
			var mode = session.mode;
			var editor = session.editor;
			var cursor = editor.getCursorPosition();
			
			var closures = this['detector' + mode.capitalize()](editor, cursor, session.data);
			
			let items = [];
			
			// remove old closures from toolbar
			session.toolbar.removeBy(this.name, 'left');
			
			if (!closures.length) {
				this._checking = false;
				return;
			}
			
			closures.forEach(item => {
				items.push({
					name: this.name,
					side: 'left',
					data: {
						position: item.pos,
					},
					//add space if user selects tree
					el: $('<li class="select"></li>').text(item.name + ' ')[0],
					onSelect: (item) => {
						session.data.selection.moveCursorTo(item.data.position.row, item.data.position.column);
						session.data.selection.clearSelection();
						editor.scrollToLine(item.data.position.row, false,  true);
					}
				});
			});
			
			session.toolbar.add(items);
			
			this._checking = false;
		}
	}

	module.exports = new Extension();
});