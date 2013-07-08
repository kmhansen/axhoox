;(function($, $axure, makeSandbox) {
    
    //debugger;
    
    //console.log('Starting...');
    
    // constants
    
    var PACKAGE = 'AXHOOX';
    
    var USER_SCRIPT_NAME_PREFIX = PACKAGE.toLowerCase();
    
    // object type that is a master reference
    var MASTER_REF_TYPE = 'referenceDiagramObject';
    
    // object type that is a dynamic panel reference
    var PANEL_REF_TYPE = 'dynamicPanel';
    
    var PAGE_TYPE = 'Axure:Page'
    
    // event names for hooks
    var EVENT_NAMES = ['click', 'mouseover', 'mouseout', 'change', 'keyup', 'focus', 'blur' ];
    
    // special events
    var SPECIAL_EVENT_NAMES = [
		'widgetIdToDragDropFunction',
		'widgetIdToDragFunction',
		'widgetIdToHideFunction',
		'widgetIdToMoveFunction',
		'widgetIdToPanelStateChangeFunction',
		'widgetIdToShowFunction',
		'widgetIdToStartDragFunction',
		'widgetIdToSwipeLeftFunction',
		'widgetIdToSwipeRightFunction',		
	];

    
    // regexp for querying rdo##AAA type functions
    var RDO_RX = /^rdo(\d+)(\D+)$/;
    
    // status master name
    var STATUS_MASTER = 'axhoox-status';
    
    // status ready event
    var STATUS_READY_EVENT = 'AxHooxReady';
    var PREPARE_MASTER_CONTEXT_EVENT = 'AxHooxPrepareMasterContext'
    
    // context objects prototypes
    
    var _defaultContext = Object.create(Context.prototype, {
    	constructor	: {
    		value		: Context,
    	},
		init		: {
			value		: function() {return this;},
			writable	: true
		}
    });
    
	var _defaultMasterContext = Object.create(_defaultContext, {
		autostart 	: {
			value 		: false,
			writable	: true
		}
	});
	
	var _defaultPageContext = Object.create(_defaultContext);
    
    
    // runtime vars
    
    var _scriptIdToPath = {};
    var _pathToContext = {};
    var _rdoFnToPath = [];
    var _scriptIdToOwnerIndex = {};
    
    var _currentCallInfo;
    
    var _savedSetVariableValueHandler;
    var _triggeringVarName;

	// script cache    
	var _scripts = {};
	
    // preserving calling information
    
    // prepare a restore function
    function _makeRestoreFn(callInfo) {
    	return function() {
    		_currentCallInfo = callInfo;
    	};
    }
    
    // save calling information object
    function _saveCallInfo(callInfo, args) {
    	callInfo = $.extend(true, {}, callInfo, {
    		restore : _makeRestoreFn(_currentCallInfo),
    		args	: args
    	});
		_currentCallInfo = callInfo;
    }
    
    // restore calling information object
    function _restoreCallInfo() {
    	if (typeof (_currentCallInfo) !== 'undefined') {
    		_currentCallInfo.restore();
    	}
    }

	// wrap any function with an encelope preserving calling info object
    function _wrap(fn, callInfo) {
    	return (function() {
    		_saveCallInfo(callInfo, Array.prototype.slice.call(arguments));
    		fn.apply(this, arguments);
    		_restoreCallInfo();
    	})
    }
    
    // wrap an rdo function
    function _wrapRdoFn(rdoIdx, eventName) {
    	var rdoName = 'rdo' + rdoIdx + eventName;
    	var fn = window[rdoName];
    	
    	window[rdoName] = _wrap(window[rdoName], {
    		eventName 	: eventName,
    		path		: _rdoFnToPath[rdoIdx]
    	});
    }
    
    // wrap all handlers for provided eventName and scriptId
    function _wrapObjectEventHandlers(scriptId, eventName) {
    	
    	var domCtx = document.getElementById(scriptId);
    	var evInfo = $._data(domCtx, 'events');
    	
    	if (!evInfo || !evInfo[eventName] || !evInfo[eventName].length) {
    		// no handlers, return
    		return;
    	}
    	
    	var $domCtx = $(domCtx);
    	
    	evInfo[eventName].forEach(function(ei) {
    		var handler = ei.handler;
    		$domCtx.off(eventName, handler);
    		$domCtx.on(eventName, _wrap(handler, {
	    		eventName 	: eventName,
	    		path		: _scriptIdToPath[scriptId]
    		}));
    	});
    	
    }


/////////////////////////////////////////////////////////////////////////////////////////////////////////
// Context API
/////////////////////////////////////////////////////////////////////////////////////////////////////////

	// agnostics (low level)

    // return context object for given path
    function _getContext(path) {
    	if (typeof(_pathToContext[path]) === 'string') {
    		// lazy evauation on a path basis
    		var scriptId = _pathToContext[path];
    		var axObject = $axure.pageData.scriptIdToObject[scriptId];
    		var o, initContext = _defaultContext;
    		if (axObject.type === MASTER_REF_TYPE) {
    			initContext = $axure.pageData.masters[axObject.masterId]._axHooxMasterContext || _defaultMasterContext;
    		}
    		_pathToContext[path] = o = Object.create(initContext);
    		Context.call(o, path, scriptId);
    		return o;
    	}
    	
    	return _pathToContext[path];
    }
    
    
    function _getOwnerPath(path) {
    	var scriptId = _pathToContext[path], oidx;
    	if (scriptId instanceof Context) {
    		oidx = scriptId.ownerIdx;
    	} else {
    		oidx = _scriptIdToOwnerIndex[scriptId];
    	}
    	return oidx === -1 ? '/' : _rdoFnToPath[oidx];
    }
    
	function _fireRemoteEvent(path, eventName, rdoIdx) {
		
		var bIsRdoIdx = typeof(rdoIdx) !== 'undefined';
		
		var args = Array.prototype.slice.call(arguments, bIsRdoIdx ? 3 : 2);
		
		rdoIdx = bIsRdoIdx ? rdoIdx : _rdoFnToPath.indexOf(path);
		
		var fn = rdoIdx !== -1 && window['rdo' + rdoIdx + eventName];
		
		if (fn instanceof Function) {
			fn.apply(null, args);
		}
	}
	
	function _getRtf(id) {
		
		if ($axure.getTypeFromScriptId(id) === 'buttonShape') {
			id = GetTextIdFromShape(id);
		}
		
	    var idQuery = $('#' + id);
	    if (idQuery.is('div')) {

	        return idQuery.find('div[id$="_rtf"]').html();
	        
	    } else if (idQuery.is('input') &&
	        (idQuery.attr('type') == 'checkbox' || idQuery.attr('type') == 'radio')) {
	        return idQuery.parent().find('label').find('div[id$="_rtf"]').html();
	    } else {
	        return idQuery.val();
	    }
	}
	
	function _getText(id) {
		
		if ($axure.getTypeFromScriptId(id) === 'buttonShape') {
			id = GetTextIdFromShape(id);
		}
		
		return GetWidgetText(id);
		
	}
	
	function _setRtf(id, htmlText) {
		
		if ($axure.getTypeFromScriptId(id) === 'buttonShape') {
			id = GetTextIdFromShape(id);
		}
		
		SetWidgetRichText(id, htmlText);
		
	}
	
	function _setText(id, txt, force) {

		var type, styleType, styleProps, finalStyle, diagramObject, currentState, $rtf, $targetSpan, $targetP;
		
		txt = txt || '';
		
		diagramObject = $axure.pageData.scriptIdToObject[id];
		currentState = GetWidgetCurrentState(id);
		
		type = styleType = diagramObject.type;
		
		if (type === 'buttonShape') {
			id = GetTextIdFromShape(id);
			type = 'richTextPanel';
		}
		
		if (type === 'richTextPanel') {
			
			$rtf = $('#' + id).find('div[id$="_rtf"]');
			
			$targetP = $rtf.children('p:first');
			
			var canClone = $targetP.length > 0 && $targetP.children('span').length > 0;

			// taken from axurerp_beforepagescript.js modified a little
			if (force === true || !canClone) {
				$targetP = $('<p><span></span></p>');
				finalStyle = $.extend({}, $axure.pageData.stylesheet.defaultStyles[styleType], diagramObject.style, diagramObject.getStateStyleOverrides('normal'));
				styleProps = GetCssStyleProperties(finalStyle);
			} else {
				$targetP = $targetP.clone();
				$targetP.children('span:not(:first)').remove();
			}
			
            $targetP.children().text(txt.replace(/\n/g, '--NEWLINE--'));
            if (styleProps) {
		        $targetP.find('*').andSelf().each(function (index, element) {
		            ApplyCssProps(element, styleProps);
		        });
	        }
            
            SetWidgetRichText(id, $targetP.get(0).outerHTML.replace(/--NEWLINE--/g, '<br/>'));

			if (currentState !== 'normal' && (force === true || !canClone)) {
				// re apply state overrides
				styleProps = GetCssStyleProperties(diagramObject.getStateStyleOverrides(currentState));
				$rtf.find('*').each(function(index, element) {
					ApplyCssProps(element, styleProps);
				});
			}				
                
			
		} else {
			SetWidgetFormText(id, txt);
		}
		
	}

	
	
	// methods
	
	// for masters
	function _fireEvent(eventName) {
		var args = Array.prototype.slice.call(arguments, 1);
		args.splice(0, 0, this.path, eventName, this.rdoIdx);
		_fireRemoteEvent.apply(null, args);
	}
	
	// common set
	function _getNewContext(newPath) {
		if (newPath.charAt(0) === '/') {
			// absolute path
			return _getContext(newPath);
		} else {
			return _getContext(this.path !== '/' ? this.path + '/' + newPath : this.path + newPath);
		}
	}
	
	function _getParentContext() {
		var path = this.path;
		if (path.length > 1){
			path = path.split('/').slice(0, -1).join('/');
			return _getNewContext(path);
		} else {
			return this;
		}
	}
	
	function _getOwnerContext() {
		if (this.ownerIdx >= 0 ) {
			return _getNewContext(_rdoFnToPath[this.ownerIdx]);
		} else {
			return this.page;
		}
	}
	
	// for dynamic panels
	
	// persist states array in Context instance
	function _fixPanelStates(states) {
		Object.defineProperty(this, 'getStates', {
			value : function() {
				return states.concat();
			},
			writable : false,
			enumerable : false
		});
	}
	
	// aquire states array
	function _getPanelStates() {
		var axCtx = $axure.pageData.scriptIdToObject[this.scriptId];
		var s = [];
		for (var i = 0, l = axCtx.diagrams.length; i < l; i++) {
			s.push(axCtx.diagrams[i].label);
		}
		_fixPanelStates.call(this, s);
		return this.getStates();
	}
	
	// get current state of dynamic panel
	function _getPanelState() {
		var sid = GetPanelState(this.scriptId);
		var m = sid.match(/^pd(\d+)u\d+$/);
		if (m) {
			return this.getStates()[parseInt(m[1])];
		} else {
			return '';
		}
	}
	
	function _setPanelState(scriptId, s) {
		var states = this.getStates(), i = -1;
		if (typeof(s) === 'number' && s < states.length) {
			i = s;
		} else {
			i = states.indexOf(s);
		}
		if (i !== -1) {
			var args = Array.prototype.slice.call(arguments);
			args[1] = 'pd' + i + scriptId;
			SetPanelState.apply(null, args);
		}
	}
	
	function _getRect() {
		
		var widget = $('#' + this.scriptId);
		
		return new Rectangle(
			Number(widget.css('left').replace('px', '')),
			Number(widget.css('top').replace('px', '')),
			Number(widget.css('width').replace('px', '')),
			Number(widget.css('height').replace('px', ''))
		);
	}
	
	
	
	//debugger;
	// bit flags for API method creation
	var FL_ASIS = 0x0000;	// take as is - given function is ready to serve as a method
	var FL_PROXY = 0x0001;	// wrap with a proxy function which create appropriate scope 
	var FL_VAL = 0x0002;	// proxy method should return a value instead of default context object return 
	var FL_W = 0x0004;		// writable, enable override
	var FL_THIS = 0x0008	// proxied fn should be applied to this
	var FL_ALL = 0xFFFF;	// all flags enabled
	
	// API mapping sets
	var API_MAP = {
		'referenceDiagramObject' : {
			names		: ['fireEvent'],
			methods		: [_fireEvent],
			flags		: [FL_ASIS]
		},
		'Axure:Page' : {
			names		: ['get'],
			methods		: [_getNewContext],
			flags		: [FL_ASIS]
		},
		'dynamicPanel' : {
			names		: ['setVisibility', 'setState', 'setNextState', 'setPreviousState', 'getState', 'getStates', 'moveTo', 'moveBy', 'getRect'],
			methods		: [SetPanelVisibility, _setPanelState, SetPanelStateNext, SetPanelStatePrevious, _getPanelState, _getPanelStates, MoveWidgetTo, MoveWidgetBy, _getRect],
			flags		: [FL_PROXY, FL_PROXY | FL_THIS, FL_PROXY, FL_PROXY, FL_ASIS, FL_W, FL_PROXY, FL_PROXY, FL_ASIS],
			defaults	: {
				'setVisibility'		: ['', 'none', 0],
				'setState'			: [0, 'none', '', 0, 'none', '', 0],
				'setNextState' 		: [false, 'none', '', 0, 'none', '', 0],
				'setPreviousState' 	: [false, 'none', '', 0, 'none', '', 0],
				'moveTo'			: [0, 0, 'none', 0],
				'moveBy'			: [0, 0, 'none', 0]
			}
		},
		'richTextPanel' : {
			names		: ['getText', 'getRtf', 'setRtf', 'setText'],
			methods		: [_getText, _getRtf, _setRtf, _setText],
			flags		: [FL_PROXY | FL_VAL, FL_PROXY | FL_VAL, FL_PROXY, FL_PROXY],
			defaults	: {
				
			}
		},
		'buttonShape'	: {
			names		: ['getText', 'getRtf', 'setRtf', 'setText'],
			methods		: [_getText, _getRtf, _setRtf, _setText],
			flags		: [FL_PROXY | FL_VAL, FL_PROXY | FL_VAL, FL_PROXY, FL_PROXY],
			defaults	: {
				
			}
		},
		'textBox' : {
			names		: [],
			methods		: [],
			flags		: []
		},
		'textArea' : {
			names		: [],
			methods		: [],
			flags		: []
		},
		'listBox' : {
			names		: [],
			methods		: [],
			flags		: []
		},
		'comboBox' : {
			names		: [],
			methods		: [],
			flags		: []

		},
		'checkbox' : {
			names		: [],
			methods		: [],
			flags		: []
		},
		'default' : {
			names		: ['get', 'getParent', 'getOwner'],
			methods		: [_getNewContext, _getParentContext, _getOwnerContext],
			flags		: [FL_ASIS, FL_ASIS, FL_ASIS]
		}
	}
	
	function _createProxy(fn, flags, defaults) {
		defaults = defaults || [];
		return function() {
			var args = Array.prototype.slice.call(arguments).concat(defaults.slice(arguments.length));
			//args = args.concat(defaults.slice(args.length));
			args.unshift(this.scriptId);
			var r = fn.apply(flags & FL_THIS ? this : null, args);
			return flags & FL_VAL ? r : this;
		};
	}
	
	function _createApi(o, sets, addDefaults) {
		
		//debugger;
		
		addDefaults = addDefaults !== false;
		
		sets = $.isArray(sets) ? sets : [sets];
		
		if (addDefaults) {
			sets.unshift('default');
		}
		
		for (var i = 0, li = sets.length; i < li; i++) {
			var s = API_MAP[sets[i]];
			if (typeof(s) === 'undefined') {
				continue;
			}
			for (var j = 0, lj = s.names.length; j < lj; j++) {
				
				if (s.flags[j] & FL_PROXY) {
					s.methods[j] = _createProxy(s.methods[j], s.flags[j], s.defaults && s.defaults[s.names[j]]);
					s.flags[j] &= ~FL_PROXY;
				}
				
				Object.defineProperty(o, s.names[j], {
					value 		: s.methods[j],
					writable	: s.flags[j] & FL_W,
					enumerable	: false
				});
			}
		}
		
	}
    
    // Context class
    function Context(path, scriptId) {
    	
    	var _iAmPage = typeof(scriptId) === 'undefined';
    	var type = !_iAmPage ? $axure.getTypeFromScriptId(scriptId) : $axure.pageData.page.type;
    	
    	Object.defineProperties(this, {
    		path : {
    			value : path,
    			writable: false,
    			enumerable: true
    		},
    		scriptId : {
    			value : scriptId,
    			writable : false,
    			enumerable: !_iAmPage

    		},
    		rdoIdx : {
    			value : type === MASTER_REF_TYPE ? _rdoFnToPath.indexOf(path) : undefined,
    			writable: false,
    			enumerable : type === MASTER_REF_TYPE
    		},
    		ownerIdx : {
    			value : _iAmPage ? -1 : _scriptIdToOwnerIndex[scriptId],
    			writable : false,
    			enumerable : true
    		},
    		data : {
    			value : {},
    			writable : false,
    			enumerable: true

    		},
    		label : {
    			value : !_iAmPage ? $axure.pageData.scriptIdToObject[scriptId].label : undefined,
    			writable : false,
    			enumerable: !_iAmPage

    		},
    		page : {
    			value : !_iAmPage ? _pathToContext['/'] : this,
    			writable : false,
    			enumerable: true

    		},
    		type : {
    			value : type,
    			writable : false,
    			enumerable: true

    		},
    		master : {
    			value : type === MASTER_REF_TYPE ? $axure.pageData.masters[$axure.pageData.scriptIdToObject[scriptId].masterId].name : undefined,
    			writable : false,
    			enumerable: type === MASTER_REF_TYPE
    		}
    	});
    	
    	if (!_iAmPage) {
    		delete _scriptIdToOwnerIndex[scriptId];
    	}
    	
    	_createApi(this, type, !_iAmPage);
    	
    	this.init();
    	
    }
    
/////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialization
/////////////////////////////////////////////////////////////////////////////////////////////////////////

    // traverse axure object model and record appropriate values 
    function _traversePage() {
    	var scriptIdx = 0, unlabeledIdx = 0;
    	
    	function traverseDiagramObject(diagramObject, path) {
    		walkDiagramObjects(diagramObject.objects, path);
    	}
    	
    	function warnNonLabeled(o, path) {
    		var txt = 'Fixing non existent label for \n' +
    		(o.type === MASTER_REF_TYPE ? 'Master:[' + $axure.pageData.masters[o.masterId].name + ']' : o.type) +
    		'\n@' + path +
    		'\nThe new label is ' + o.label +
    		'\nand may appear in other paths.' +
    		'\nBetter fix it in Axure.';
    		console.warn(txt);
    	}
    	
    	function walkDiagramObjects(objects, path) {
    		var o, mo, po, newPath, scriptId, ownerIdx = _rdoFnToPath.length - 1;
    		for (var i = 0, li = objects.length; i < li; i++) {
    			o = objects[i];
    			if (o.isContained && o.type === 'richTextPanel' && o.label.length === 0) {
    				o.label = 'txt';
    			} else if (o.label.length === 0) {
    				unlabeledIdx++;
    				o.label = 'unlabeled-' + unlabeledIdx;
    				warnNonLabeled(o, path);
    			}
				newPath = path + '/' + o.label;
				if (o.type === MASTER_REF_TYPE) {
					_rdoFnToPath.push(newPath);
					traverseDiagramObject($axure.pageData.masters[o.masterId].diagram, newPath);
    				scriptId = $axure.pageData.objectPathToScriptId[scriptIdx].scriptId;
				} else {
    				scriptId = $axure.pageData.objectPathToScriptId[scriptIdx].scriptId;
				} 
				
				_pathToContext[newPath] = scriptId;
				_scriptIdToOwnerIndex[scriptId] = ownerIdx;
				_scriptIdToPath[scriptId] = newPath;
				scriptIdx++;

				if (o.type === PANEL_REF_TYPE) {
					for (var j = 0, lj = o.diagrams.length; j < lj; j++) {
						traverseDiagramObject(o.diagrams[j], newPath);
					}
				} else if (o.type === 'buttonShape') {
					traverseDiagramObject(o, newPath);
				}
    		}
    	}
    	
    	traverseDiagramObject($axure.pageData.page.diagram, '');
    	
    }

	function _initPageContext() {
		var p = '/';
    	var po = _pathToContext[p] = Object.create($axure.pageData.page._axHooxPageContext || _defaultPageContext);
    	Context.call(po, p);
    	_currentCallInfo = {
    		eventName 	: null,
    		path		: p
    	};
	}

	function _wrapRdoFunctions() {
	    Object.keys(window).forEach(function(k) {
	        
	        if (!(window[k] instanceof Function)) {
	            return;
	        }
	        
	        var r = RDO_RX.exec(k);
	        var fnIdx, evName, domCtx;
	        // console.log('Checking:' + k);
	        if (r) {
	            
	            // console.log('Wrapping:' + k);
	            _wrapRdoFn(parseInt(r[1]), r[2]);
	            
	        }
	    });
	}
	
    // create event wraps for existing event handlers
	function _wrapEventHandlers() {
	    $axure(function(o) {return o.type != "referenceDiagramObject";}).getIds().forEach(function(scriptId) {
		    EVENT_NAMES.forEach(function(eventName) {
		    	_wrapObjectEventHandlers(scriptId, eventName)
		    });
	    });
	}
	
	function _wrapWidgetSpecialEventFunctions() {
		
		SPECIAL_EVENT_NAMES.forEach(function(eventName) {
			for (var scriptId in window[eventName]) {
				window[eventName][scriptId] = _wrap(window[eventName][scriptId], {
    				eventName 	: eventName,
    				path		: _scriptIdToPath[scriptId]
    			});
			}
		})
		
	}
	
	// main hook. handling setVariableValue events
	
	function _handlerPrecheck(varname, value) {
			if (varname !== _triggeringVarName) {
				$axure.globalVariableProvider._setVariableValue.apply($axure.globalVariableProvider, arguments);
				return false;
			} else if (value === PACKAGE) {
				console.log('Probably chrome local delayed message.');
				return false;
			} else if (!_currentCallInfo.args) {
				console.warn('Calling from unknown scope.');
			}
			return true;
	}
	
	function prepareMasterContext(masterName, context) {
		Object.keys($axure.pageData.masters).some(function(m) {
			if (m.name === masterName) {
				m._axHooxMasterContext = $.extend(true, {}, context);
				return true;
			}
			return false;
		});
	}
	
	function preparePageContext(context) {
		$axure.pageData.page._axHooxPageContext = $.extend(
			true, 
			Object.create(_defaultPageContext), 
			context
		);
	}
	
	// generate unique id for a string
	function CRC32(s) { 
		var iCRC = 0xFFFFFFFF, bytC, bytT, lngA, r; 
		var t = CRC32.aCRC32Table;
		for (var i = 0, l = s.length; i < l; i++) {
			r = s.charCodeAt(i);
			do {
				bytC = r & 0xFF;
				bytT = (iCRC & 0xFF) ^ bytC; 
				lngA = iCRC >>> 8; 
				iCRC = lngA ^ t[bytT];
				r = r >>> 8;
			} while (r);
		} 
		return '_' + ((iCRC ^ 0xFFFFFFFF) >>> 0).toString(16) + '_'; 
	}
	
	CRC32.aCRC32Table = [
		0x0, 0x77073096, 0xEE0E612C, 0x990951BA, 0x76DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3, 
		0xEDB8832, 0x79DCB8A4,	0xE0D5E91E, 0x97D2D988, 0x9B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91, 
		0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7, 
		0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9,	0xFA0F3D63, 0x8D080DF5, 
		0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 
		0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59, 
		0x26D930AC, 0x51DE003A,	0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F, 
		0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924,	0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D, 
		0x76DC4190, 0x1DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x6B6B51F, 0x9FBFE4A5, 0xE8B8D433, 
		0x7807C9A2, 0xF00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x86D3D2D, 0x91646C97, 0xE6635C01, 
		0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 
		0x65B0D9C6, 0x12B7E950,	0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65, 
		0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2,	0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB, 
		0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5,	0xAA0A4C5F, 0xDD0D7CC9, 
		0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F, 
		0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD, 
		0xEDB88320, 0x9ABFB3B6,	0x3B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x4DB2615, 0x73DC1683, 
		0xE3630B12, 0x94643B84, 0xD6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0xA00AE27, 0x7D079EB1, 
		0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7, 
		0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 
		0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B, 
		0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79, 
		0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F, 
		0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D, 
		0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x26D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x5005713, 
		0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0xCB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0xBDBDF21, 
		0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777, 
		0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45, 
		0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB, 
		0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9, 
		0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF, 
		0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D
	];
	
	function _prepareMasterContextHandler(varname, value) {
		
		var args, masterContext, axObject, scriptParams, owner, scriptId;
		
		if (!_handlerPrecheck.apply(null, arguments)) {
			return;
		}
		
		args = _currentCallInfo.args ? _currentCallInfo.args.slice() : [];
		
		scriptId = _pathToContext[_currentCallInfo.path];
		
		owner = scriptId instanceof Context ? $axure.pageData.page : $axure.pageData.scriptIdToObject[scriptId].owner;
		
		if (owner.type === 'Axure:Master') {
			
			if (owner.hasOwnProperty('_axHooxMasterContext')) {
				// already defined. nothing to do
				// console.log('Master Context already set. Returning.');
				return;
			}
			
			owner._axHooxMasterContext = masterContext =  Object.create(_defaultMasterContext);
			
			args.splice(0, 0, masterContext, prepareMasterContext, preparePageContext, _currentCallInfo.eventName);
			scriptParams = 'masterContext, prepareMasterContext, preparePageContext, eventName';
		} else {
			args.splice(0, 0, prepareMasterContext, preparePageContext, _currentCallInfo.eventName);
			scriptParams = 'prepareMasterContext, preparePageContext, eventName';
		}
		
		console.log('Starting handling in the AxHooxPrepareMasterContext mode...');
		var crc = CRC32(value);
		try {
			var fn = _scripts[crc] || (_scripts[crc] = makeSandbox("(function usr_fn" + crc + "(" + scriptParams + ") {\n" + value + "\n});", USER_SCRIPT_NAME_PREFIX + crc));
			fn.apply(null, args);
		} catch (e) {
			console.error(e);
		}
		console.log('Finished.');
	}
	
	function _regularHandler(varname, value) {

		if (!_handlerPrecheck.apply(null, arguments)) {
			return;
		}
		
		console.time('Regular handler');
		var args = _currentCallInfo.args ? _currentCallInfo.args.slice() : [];
		args.unshift(_currentCallInfo.eventName);
		args.unshift(_getContext(_currentCallInfo.path));
		
		var crc = CRC32(value);
		try {
			var fn = _scripts[crc] || (_scripts[crc] = makeSandbox("(function usr_fn" + crc + "(scriptContext, eventName) {\n" + value + "\n});", USER_SCRIPT_NAME_PREFIX + crc));
			fn.apply(null, args);
		} catch (e) {
			console.error(e.toString(), e.stack || '');
		}
		console.timeEnd('Regular handler');
	}
	
	function _setHandler(handler, save) {
		if (save === true) {
			_savedSetVariableValueHandler = $axure.globalVariableProvider.setVariableValue;
			$(window).on('beforeunload', function() {
				console.log('Unregistering handler');
				$axure.globalVariableProvider.setVariableValue = _savedSetVariableValueHandler;
			});
		}
		
		$axure.globalVariableProvider.setVariableValue = handler;
	}
    
    function _init() {
    	
    	window[PACKAGE] = {
    		init	: false
    	};

		if (!$axure.globalVariableProvider.getDefinedVariables().some(function(v) {
			if ($axure.globalVariableProvider.getVariableValue(v) === PACKAGE) {
				_triggeringVarName = v;
				return true;
			}
		})) {
			// no triggering var. nothing to do.
			return;
		}

    	_traversePage();
    	_wrapRdoFunctions();
    	_wrapEventHandlers();
    	_wrapWidgetSpecialEventFunctions();
    	
    	var statusObjects = $axure(function(o) {
    		return o.type === MASTER_REF_TYPE && $axure.pageData.masters[o.masterId].name === STATUS_MASTER;
    	}).getIds();
    	
    	_setHandler(_prepareMasterContextHandler, true);

		// raise prepare master context events    	
    	statusObjects.forEach(function(sid) {
    		_fireRemoteEvent(_scriptIdToPath[sid], PREPARE_MASTER_CONTEXT_EVENT);
    	});
    	

    	_setHandler(_regularHandler);

    	_initPageContext();
    	
    	// process instancess of masters with an autostart option
    	
    	$axure(function(o) {
    		return o.type === MASTER_REF_TYPE && $axure.pageData.masters[o.masterId]._axHooxMasterContext && $axure.pageData.masters[o.masterId]._axHooxMasterContext.autostart;
    	}).getIds().forEach(function(scriptId) {
    		_getContext(_scriptIdToPath[scriptId]);
    	});
    	
    	window[PACKAGE].init = true;
    	
    	// propagate ready events on all status instances
    	statusObjects.forEach(function(sid) {
    		_fireRemoteEvent(_scriptIdToPath[sid], STATUS_READY_EVENT);
    	});
    }
    
    if (!Object.hasOwnProperty(window, PACKAGE)) {
    	_init();
    }
    
})(jQuery, $axure, function(scr, name) {
	scr += '\n//@ sourceURL=' + window.location.href.match(/(\S+\/)\S+$/)[1] + '__axhoox/' + name + '.js\n';
	return eval(scr);
});
