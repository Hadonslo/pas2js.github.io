﻿var pas = {};

var rtl = {

  version: 10501,

  quiet: false,
  debug_load_units: false,
  debug_rtti: false,

  $res : {},

  debug: function(){
    if (rtl.quiet || !console || !console.log) return;
    console.log(arguments);
  },

  error: function(s){
    rtl.debug('Error: ',s);
    throw s;
  },

  warn: function(s){
    rtl.debug('Warn: ',s);
  },

  checkVersion: function(v){
    if (rtl.version != v) throw "expected rtl version "+v+", but found "+rtl.version;
  },

  hiInt: Math.pow(2,53),

  hasString: function(s){
    return rtl.isString(s) && (s.length>0);
  },

  isArray: function(a) {
    return Array.isArray(a);
  },

  isFunction: function(f){
    return typeof(f)==="function";
  },

  isModule: function(m){
    return rtl.isObject(m) && rtl.hasString(m.$name) && (pas[m.$name]===m);
  },

  isImplementation: function(m){
    return rtl.isObject(m) && rtl.isModule(m.$module) && (m.$module.$impl===m);
  },

  isNumber: function(n){
    return typeof(n)==="number";
  },

  isObject: function(o){
    var s=typeof(o);
    return (typeof(o)==="object") && (o!=null);
  },

  isString: function(s){
    return typeof(s)==="string";
  },

  getNumber: function(n){
    return typeof(n)==="number"?n:NaN;
  },

  getChar: function(c){
    return ((typeof(c)==="string") && (c.length===1)) ? c : "";
  },

  getObject: function(o){
    return ((typeof(o)==="object") || (typeof(o)==='function')) ? o : null;
  },

  isTRecord: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$new') && (typeof(type.$new)==='function'));
  },

  isPasClass: function(type){
    return (rtl.isObject(type) && type.hasOwnProperty('$classname') && rtl.isObject(type.$module));
  },

  isPasClassInstance: function(type){
    return (rtl.isObject(type) && rtl.isPasClass(type.$class));
  },

  hexStr: function(n,digits){
    return ("000000000000000"+n.toString(16).toUpperCase()).slice(-digits);
  },

  m_loading: 0,
  m_loading_intf: 1,
  m_intf_loaded: 2,
  m_loading_impl: 3, // loading all used unit
  m_initializing: 4, // running initialization
  m_initialized: 5,

  module: function(module_name, intfuseslist, intfcode, impluseslist, implcode){
    if (rtl.debug_load_units) rtl.debug('rtl.module name="'+module_name+'" intfuses='+intfuseslist+' impluses='+impluseslist+' hasimplcode='+rtl.isFunction(implcode));
    if (!rtl.hasString(module_name)) rtl.error('invalid module name "'+module_name+'"');
    if (!rtl.isArray(intfuseslist)) rtl.error('invalid interface useslist of "'+module_name+'"');
    if (!rtl.isFunction(intfcode)) rtl.error('invalid interface code of "'+module_name+'"');
    if (!(impluseslist==undefined) && !rtl.isArray(impluseslist)) rtl.error('invalid implementation useslist of "'+module_name+'"');
    if (!(implcode==undefined) && !rtl.isFunction(implcode)) rtl.error('invalid implementation code of "'+module_name+'"');

    if (pas[module_name])
      rtl.error('module "'+module_name+'" is already registered');

    var module = pas[module_name] = {
      $name: module_name,
      $intfuseslist: intfuseslist,
      $impluseslist: impluseslist,
      $state: rtl.m_loading,
      $intfcode: intfcode,
      $implcode: implcode,
      $impl: null,
      $rtti: Object.create(rtl.tSectionRTTI)
    };
    module.$rtti.$module = module;
    if (implcode) module.$impl = {
      $module: module,
      $rtti: module.$rtti
    };
  },

  exitcode: 0,

  run: function(module_name){
  
    function doRun(){
      if (!rtl.hasString(module_name)) module_name='program';
      if (rtl.debug_load_units) rtl.debug('rtl.run module="'+module_name+'"');
      rtl.initRTTI();
      var module = pas[module_name];
      if (!module) rtl.error('rtl.run module "'+module_name+'" missing');
      rtl.loadintf(module);
      rtl.loadimpl(module);
      if (module_name=='program'){
        if (rtl.debug_load_units) rtl.debug('running $main');
        var r = pas.program.$main();
        if (rtl.isNumber(r)) rtl.exitcode = r;
      }
    }
    
    if (rtl.showUncaughtExceptions) {
      try{
        doRun();
      } catch(re) {
        var errMsg = rtl.hasString(re.$classname) ? re.$classname : '';
	    errMsg +=  ((errMsg) ? ': ' : '') + (re.hasOwnProperty('fMessage') ? re.fMessage : re);
        alert('Uncaught Exception : '+errMsg);
        rtl.exitCode = 216;
      }
    } else {
      doRun();
    }
    return rtl.exitcode;
  },

  loadintf: function(module){
    if (module.$state>rtl.m_loading_intf) return; // already finished
    if (rtl.debug_load_units) rtl.debug('loadintf: "'+module.$name+'"');
    if (module.$state===rtl.m_loading_intf)
      rtl.error('unit cycle detected "'+module.$name+'"');
    module.$state=rtl.m_loading_intf;
    // load interfaces of interface useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadintf);
    // run interface
    if (rtl.debug_load_units) rtl.debug('loadintf: run intf of "'+module.$name+'"');
    module.$intfcode(module.$intfuseslist);
    // success
    module.$state=rtl.m_intf_loaded;
    // Note: units only used in implementations are not yet loaded (not even their interfaces)
  },

  loaduseslist: function(module,useslist,f){
    if (useslist==undefined) return;
    var len = useslist.length;
    for (var i = 0; i<len; i++) {
      var unitname=useslist[i];
      if (rtl.debug_load_units) rtl.debug('loaduseslist of "'+module.$name+'" uses="'+unitname+'"');
      if (pas[unitname]==undefined)
        rtl.error('module "'+module.$name+'" misses "'+unitname+'"');
      f(pas[unitname]);
    }
  },

  loadimpl: function(module){
    if (module.$state>=rtl.m_loading_impl) return; // already processing
    if (module.$state<rtl.m_intf_loaded) rtl.error('loadimpl: interface not loaded of "'+module.$name+'"');
    if (rtl.debug_load_units) rtl.debug('loadimpl: load uses of "'+module.$name+'"');
    module.$state=rtl.m_loading_impl;
    // load interfaces of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadintf);
    // load implementation of interfaces useslist
    rtl.loaduseslist(module,module.$intfuseslist,rtl.loadimpl);
    // load implementation of implementation useslist
    rtl.loaduseslist(module,module.$impluseslist,rtl.loadimpl);
    // Note: At this point all interfaces used by this unit are loaded. If
    //   there are implementation uses cycles some used units might not yet be
    //   initialized. This is by design.
    // run implementation
    if (rtl.debug_load_units) rtl.debug('loadimpl: run impl of "'+module.$name+'"');
    if (rtl.isFunction(module.$implcode)) module.$implcode(module.$impluseslist);
    // run initialization
    if (rtl.debug_load_units) rtl.debug('loadimpl: run init of "'+module.$name+'"');
    module.$state=rtl.m_initializing;
    if (rtl.isFunction(module.$init)) module.$init();
    // unit initialized
    module.$state=rtl.m_initialized;
  },

  createCallback: function(scope, fn){
    var cb;
    if (typeof(fn)==='string'){
      cb = function(){
        return scope[fn].apply(scope,arguments);
      };
    } else {
      cb = function(){
        return fn.apply(scope,arguments);
      };
    };
    cb.scope = scope;
    cb.fn = fn;
    return cb;
  },

  cloneCallback: function(cb){
    return rtl.createCallback(cb.scope,cb.fn);
  },

  eqCallback: function(a,b){
    // can be a function or a function wrapper
    if (a==b){
      return true;
    } else {
      return (a!=null) && (b!=null) && (a.fn) && (a.scope===b.scope) && (a.fn==b.fn);
    }
  },

  initStruct: function(c,parent,name){
    if ((parent.$module) && (parent.$module.$impl===parent)) parent=parent.$module;
    c.$parent = parent;
    if (rtl.isModule(parent)){
      c.$module = parent;
      c.$name = name;
    } else {
      c.$module = parent.$module;
      c.$name = parent.$name+'.'+name;
    };
    return parent;
  },

  initClass: function(c,parent,name,initfn){
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    if (rtl.debug_rtti) rtl.debug('initClass '+c.$fullname);
    var t = c.$module.$rtti.$Class(c.$name,{ "class": c });
    c.$rtti = t;
    if (rtl.isObject(c.$ancestor)) t.ancestor = c.$ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  createClass: function(parent,name,ancestor,initfn){
    // create a normal class,
    // ancestor must be null or a normal class,
    // the root ancestor can be an external class
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // Note:
      // if root is an "object" then c.$ancestor === Object.getPrototypeOf(c)
      // if root is a "function" then c.$ancestor === c.__proto__, Object.getPrototypeOf(c) returns the root
    } else {
      c = { $ancestor: null };
      c.$create = function(fn,args){
        if (args == undefined) args = [];
        var o = Object.create(this);
        o.$init();
        try{
          if (typeof(fn)==="string"){
            o[fn].apply(o,args);
          } else {
            fn.apply(o,args);
          };
          o.AfterConstruction();
        } catch($e){
          // do not call BeforeDestruction
          if (o.Destroy) o.Destroy();
          o.$final();
          throw $e;
        }
        return o;
      };
      c.$destroy = function(fnname){
        this.BeforeDestruction();
        if (this[fnname]) this[fnname]();
        this.$final();
      };
    };
    rtl.initClass(c,parent,name,initfn);
  },

  createClassExt: function(parent,name,ancestor,newinstancefnname,initfn){
    // Create a class using an external ancestor.
    // If newinstancefnname is given, use that function to create the new object.
    // If exist call BeforeDestruction and AfterConstruction.
    var c = Object.create(ancestor);
    c.$create = function(fn,args){
      if (args == undefined) args = [];
      var o = null;
      if (newinstancefnname.length>0){
        o = this[newinstancefnname](fn,args);
      } else {
        o = Object.create(this);
      }
      if (o.$init) o.$init();
      try{
        if (typeof(fn)==="string"){
          o[fn].apply(o,args);
        } else {
          fn.apply(o,args);
        };
        if (o.AfterConstruction) o.AfterConstruction();
      } catch($e){
        // do not call BeforeDestruction
        if (o.Destroy) o.Destroy();
        if (o.$final) this.$final();
        throw $e;
      }
      return o;
    };
    c.$destroy = function(fnname){
      if (this.BeforeDestruction) this.BeforeDestruction();
      if (this[fnname]) this[fnname]();
      if (this.$final) this.$final();
    };
    rtl.initClass(c,parent,name,initfn);
  },

  createHelper: function(parent,name,ancestor,initfn){
    // create a helper,
    // ancestor must be null or a helper,
    var c = null;
    if (ancestor != null){
      c = Object.create(ancestor);
      c.$ancestor = ancestor;
      // c.$ancestor === Object.getPrototypeOf(c)
    } else {
      c = { $ancestor: null };
    };
    parent[name] = c;
    c.$class = c; // Note: o.$class === Object.getPrototypeOf(o)
    c.$classname = name;
    parent = rtl.initStruct(c,parent,name);
    c.$fullname = parent.$name+'.'+name;
    // rtti
    var t = c.$module.$rtti.$Helper(c.$name,{ "helper": c });
    c.$rtti = t;
    if (rtl.isObject(ancestor)) t.ancestor = ancestor.$rtti;
    if (!t.ancestor) t.ancestor = null;
    // init members
    initfn.call(c);
  },

  tObjectDestroy: "Destroy",

  free: function(obj,name){
    if (obj[name]==null) return null;
    obj[name].$destroy(rtl.tObjectDestroy);
    obj[name]=null;
  },

  freeLoc: function(obj){
    if (obj==null) return null;
    obj.$destroy(rtl.tObjectDestroy);
    return null;
  },

  recNewT: function(parent,name,initfn,full){
    // create new record type
    var t = {};
    if (parent) parent[name] = t;
    function hide(prop){
      Object.defineProperty(t,prop,{enumerable:false});
    }
    if (full){
      rtl.initStruct(t,parent,name);
      t.$record = t;
      hide('$record');
      hide('$name');
      hide('$parent');
      hide('$module');
    }
    initfn.call(t);
    if (!t.$new){
      t.$new = function(){ return Object.create(this); };
    }
    t.$clone = function(r){ return this.$new().$assign(r); };
    hide('$new');
    hide('$clone');
    hide('$eq');
    hide('$assign');
    return t;
  },

  is: function(instance,type){
    return type.isPrototypeOf(instance) || (instance===type);
  },

  isExt: function(instance,type,mode){
    // mode===1 means instance must be a Pascal class instance
    // mode===2 means instance must be a Pascal class
    // Notes:
    // isPrototypeOf and instanceof return false on equal
    // isPrototypeOf does not work for Date.isPrototypeOf(new Date())
    //   so if isPrototypeOf is false test with instanceof
    // instanceof needs a function on right side
    if (instance == null) return false; // Note: ==null checks for undefined too
    if ((typeof(type) !== 'object') && (typeof(type) !== 'function')) return false;
    if (instance === type){
      if (mode===1) return false;
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if (type.isPrototypeOf && type.isPrototypeOf(instance)){
      if (mode===1) return rtl.isPasClassInstance(instance);
      if (mode===2) return rtl.isPasClass(instance);
      return true;
    }
    if ((typeof type == 'function') && (instance instanceof type)) return true;
    return false;
  },

  Exception: null,
  EInvalidCast: null,
  EAbstractError: null,
  ERangeError: null,
  EIntOverflow: null,
  EPropWriteOnly: null,

  raiseE: function(typename){
    var t = rtl[typename];
    if (t==null){
      var mod = pas.SysUtils;
      if (!mod) mod = pas.sysutils;
      if (mod){
        t = mod[typename];
        if (!t) t = mod[typename.toLowerCase()];
        if (!t) t = mod['Exception'];
        if (!t) t = mod['exception'];
      }
    }
    if (t){
      if (t.Create){
        throw t.$create("Create");
      } else if (t.create){
        throw t.$create("create");
      }
    }
    if (typename === "EInvalidCast") throw "invalid type cast";
    if (typename === "EAbstractError") throw "Abstract method called";
    if (typename === "ERangeError") throw "range error";
    throw typename;
  },

  as: function(instance,type){
    if((instance === null) || rtl.is(instance,type)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  asExt: function(instance,type,mode){
    if((instance === null) || rtl.isExt(instance,type,mode)) return instance;
    rtl.raiseE("EInvalidCast");
  },

  createInterface: function(module, name, guid, fnnames, ancestor, initfn){
    //console.log('createInterface name="'+name+'" guid="'+guid+'" names='+fnnames);
    var i = ancestor?Object.create(ancestor):{};
    module[name] = i;
    i.$module = module;
    i.$name = name;
    i.$fullname = module.$name+'.'+name;
    i.$guid = guid;
    i.$guidr = null;
    i.$names = fnnames?fnnames:[];
    if (rtl.isFunction(initfn)){
      // rtti
      if (rtl.debug_rtti) rtl.debug('createInterface '+i.$fullname);
      var t = i.$module.$rtti.$Interface(name,{ "interface": i, module: module });
      i.$rtti = t;
      if (ancestor) t.ancestor = ancestor.$rtti;
      if (!t.ancestor) t.ancestor = null;
      initfn.call(i);
    }
    return i;
  },

  strToGUIDR: function(s,g){
    var p = 0;
    function n(l){
      var h = s.substr(p,l);
      p+=l;
      return parseInt(h,16);
    }
    p+=1; // skip {
    g.D1 = n(8);
    p+=1; // skip -
    g.D2 = n(4);
    p+=1; // skip -
    g.D3 = n(4);
    p+=1; // skip -
    if (!g.D4) g.D4=[];
    g.D4[0] = n(2);
    g.D4[1] = n(2);
    p+=1; // skip -
    for(var i=2; i<8; i++) g.D4[i] = n(2);
    return g;
  },

  guidrToStr: function(g){
    if (g.$intf) return g.$intf.$guid;
    var h = rtl.hexStr;
    var s='{'+h(g.D1,8)+'-'+h(g.D2,4)+'-'+h(g.D3,4)+'-'+h(g.D4[0],2)+h(g.D4[1],2)+'-';
    for (var i=2; i<8; i++) s+=h(g.D4[i],2);
    s+='}';
    return s;
  },

  createTGUID: function(guid){
    var TGuid = (pas.System)?pas.System.TGuid:pas.system.tguid;
    var g = rtl.strToGUIDR(guid,TGuid.$new());
    return g;
  },

  getIntfGUIDR: function(intfTypeOrVar){
    if (!intfTypeOrVar) return null;
    if (!intfTypeOrVar.$guidr){
      var g = rtl.createTGUID(intfTypeOrVar.$guid);
      if (!intfTypeOrVar.hasOwnProperty('$guid')) intfTypeOrVar = Object.getPrototypeOf(intfTypeOrVar);
      g.$intf = intfTypeOrVar;
      intfTypeOrVar.$guidr = g;
    }
    return intfTypeOrVar.$guidr;
  },

  addIntf: function (aclass, intf, map){
    function jmp(fn){
      if (typeof(fn)==="function"){
        return function(){ return fn.apply(this.$o,arguments); };
      } else {
        return function(){ rtl.raiseE('EAbstractError'); };
      }
    }
    if(!map) map = {};
    var t = intf;
    var item = Object.create(t);
    if (!aclass.hasOwnProperty('$intfmaps')) aclass.$intfmaps = {};
    aclass.$intfmaps[intf.$guid] = item;
    do{
      var names = t.$names;
      if (!names) break;
      for (var i=0; i<names.length; i++){
        var intfname = names[i];
        var fnname = map[intfname];
        if (!fnname) fnname = intfname;
        //console.log('addIntf: intftype='+t.$name+' index='+i+' intfname="'+intfname+'" fnname="'+fnname+'" old='+typeof(item[intfname]));
        item[intfname] = jmp(aclass[fnname]);
      }
      t = Object.getPrototypeOf(t);
    }while(t!=null);
  },

  getIntfG: function (obj, guid, query){
    if (!obj) return null;
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query);
    // search
    var maps = obj.$intfmaps;
    if (!maps) return null;
    var item = maps[guid];
    if (!item) return null;
    // check delegation
    //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' query='+query+' item='+typeof(item));
    if (typeof item === 'function') return item.call(obj); // delegate. Note: COM contains _AddRef
    // check cache
    var intf = null;
    if (obj.$interfaces){
      intf = obj.$interfaces[guid];
      //console.log('getIntfG: obj='+obj.$classname+' guid='+guid+' cache='+typeof(intf));
    }
    if (!intf){ // intf can be undefined!
      intf = Object.create(item);
      intf.$o = obj;
      if (!obj.$interfaces) obj.$interfaces = {};
      obj.$interfaces[guid] = intf;
    }
    if (typeof(query)==='object'){
      // called by queryIntfT
      var o = null;
      if (intf.QueryInterface(rtl.getIntfGUIDR(query),
          {get:function(){ return o; }, set:function(v){ o=v; }}) === 0){
        return o;
      } else {
        return null;
      }
    } else if(query===2){
      // called by TObject.GetInterfaceByStr
      if (intf.$kind === 'com') intf._AddRef();
    }
    return intf;
  },

  getIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid);
  },

  queryIntfT: function(obj,intftype){
    return rtl.getIntfG(obj,intftype.$guid,intftype);
  },

  queryIntfIsT: function(obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (!i) return false;
    if (i.$kind === 'com') i._Release();
    return true;
  },

  asIntfT: function (obj,intftype){
    var i = rtl.getIntfG(obj,intftype.$guid);
    if (i!==null) return i;
    rtl.raiseEInvalidCast();
  },

  intfIsIntfT: function(intf,intftype){
    return (intf!==null) && rtl.queryIntfIsT(intf.$o,intftype);
  },

  intfAsIntfT: function (intf,intftype){
    if (intf){
      var i = rtl.getIntfG(intf.$o,intftype.$guid);
      if (i!==null) return i;
    }
    rtl.raiseEInvalidCast();
  },

  intfIsClass: function(intf,classtype){
    return (intf!=null) && (rtl.is(intf.$o,classtype));
  },

  intfAsClass: function(intf,classtype){
    if (intf==null) return null;
    return rtl.as(intf.$o,classtype);
  },

  intfToClass: function(intf,classtype){
    if ((intf!==null) && rtl.is(intf.$o,classtype)) return intf.$o;
    return null;
  },

  // interface reference counting
  intfRefs: { // base object for temporary interface variables
    ref: function(id,intf){
      // called for temporary interface references needing delayed release
      var old = this[id];
      //console.log('rtl.intfRefs.ref: id='+id+' old="'+(old?old.$name:'null')+'" intf="'+(intf?intf.$name:'null')+' $o='+(intf?intf.$o:'null'));
      if (old){
        // called again, e.g. in a loop
        delete this[id];
        old._Release(); // may fail
      }
      this[id]=intf;
      return intf;
    },
    free: function(){
      //console.log('rtl.intfRefs.free...');
      for (var id in this){
        if (this.hasOwnProperty(id)){
          //console.log('rtl.intfRefs.free: id='+id+' '+this[id].$name+' $o='+this[id].$o.$classname);
          this[id]._Release();
        }
      }
    }
  },

  createIntfRefs: function(){
    //console.log('rtl.createIntfRefs');
    return Object.create(rtl.intfRefs);
  },

  setIntfP: function(path,name,value,skipAddRef){
    var old = path[name];
    //console.log('rtl.setIntfP path='+path+' name='+name+' old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old === value) return;
    if (old !== null){
      path[name]=null;
      old._Release();
    }
    if (value !== null){
      if (!skipAddRef) value._AddRef();
      path[name]=value;
    }
  },

  setIntfL: function(old,value,skipAddRef){
    //console.log('rtl.setIntfL old="'+(old?old.$name:'null')+'" value="'+(value?value.$name:'null')+'"');
    if (old !== value){
      if (value!==null){
        if (!skipAddRef) value._AddRef();
      }
      if (old!==null){
        old._Release();  // Release after AddRef, to avoid double Release if Release creates an exception
      }
    } else if (skipAddRef){
      if (old!==null){
        old._Release();  // value has an AddRef
      }
    }
    return value;
  },

  _AddRef: function(intf){
    //if (intf) console.log('rtl._AddRef intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._AddRef();
    return intf;
  },

  _Release: function(intf){
    //if (intf) console.log('rtl._Release intf="'+(intf?intf.$name:'null')+'"');
    if (intf) intf._Release();
    return intf;
  },

  checkMethodCall: function(obj,type){
    if (rtl.isObject(obj) && rtl.is(obj,type)) return;
    rtl.raiseE("EInvalidCast");
  },

  oc: function(i){
    // overflow check integer
    if ((Math.floor(i)===i) && (i>=-0x1fffffffffffff) && (i<=0x1fffffffffffff)) return i;
    rtl.raiseE('EIntOverflow');
  },

  rc: function(i,minval,maxval){
    // range check integer
    if ((Math.floor(i)===i) && (i>=minval) && (i<=maxval)) return i;
    rtl.raiseE('ERangeError');
  },

  rcc: function(c,minval,maxval){
    // range check char
    if ((typeof(c)==='string') && (c.length===1)){
      var i = c.charCodeAt(0);
      if ((i>=minval) && (i<=maxval)) return c;
    }
    rtl.raiseE('ERangeError');
  },

  rcSetCharAt: function(s,index,c){
    // range check setCharAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return rtl.setCharAt(s,index,c);
  },

  rcCharAt: function(s,index){
    // range check charAt
    if ((typeof(s)!=='string') || (index<0) || (index>=s.length)) rtl.raiseE('ERangeError');
    return s.charAt(index);
  },

  rcArrR: function(arr,index){
    // range check read array
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      if (arguments.length>2){
        // arr,index1,index2,...
        arr=arr[index];
        for (var i=2; i<arguments.length; i++) arr=rtl.rcArrR(arr,arguments[i]);
        return arr;
      }
      return arr[index];
    }
    rtl.raiseE('ERangeError');
  },

  rcArrW: function(arr,index,value){
    // range check write array
    // arr,index1,index2,...,value
    for (var i=3; i<arguments.length; i++){
      arr=rtl.rcArrR(arr,index);
      index=arguments[i-1];
      value=arguments[i];
    }
    if (Array.isArray(arr) && (typeof(index)==='number') && (index>=0) && (index<arr.length)){
      return arr[index]=value;
    }
    rtl.raiseE('ERangeError');
  },

  length: function(arr){
    return (arr == null) ? 0 : arr.length;
  },

  arraySetLength: function(arr,defaultvalue,newlength){
    var stack = [];
    for (var i=2; i<arguments.length; i++){
      stack.push({ dim:arguments[i]+0, a:null, i:0, src:null });
    }
    var dimmax = stack.length-1;
    var depth = 0;
    var lastlen = stack[dimmax].dim;
    var item = null;
    var a = null;
    var src = arr;
    var oldlen = 0
    do{
      a = [];
      if (depth>0){
        item=stack[depth-1];
        item.a[item.i]=a;
        src = (item.src && item.src.length>item.i)?item.src[item.i]:null;
        item.i++;
      }
      if (depth<dimmax){
        item = stack[depth];
        item.a = a;
        item.i = 0;
        item.src = src;
        depth++;
      } else {
        oldlen = src?src.length:0;
        if (rtl.isArray(defaultvalue)){
          for (var i=0; i<lastlen; i++) a[i]=(i<oldlen)?src[i]:[]; // array of dyn array
        } else if (rtl.isObject(defaultvalue)) {
          if (rtl.isTRecord(defaultvalue)){
            for (var i=0; i<lastlen; i++){
              a[i]=(i<oldlen)?defaultvalue.$clone(src[i]):defaultvalue.$new(); // e.g. record
            }
          } else {
            for (var i=0; i<lastlen; i++) a[i]=(i<oldlen)?rtl.refSet(src[i]):{}; // e.g. set
          }
        } else {
          for (var i=0; i<lastlen; i++)
            a[i]=(i<oldlen)?src[i]:defaultvalue;
        }
        while ((depth>0) && (stack[depth-1].i>=stack[depth-1].dim)){
          depth--;
        };
        if (depth===0){
          if (dimmax===0) return a;
          return stack[0].a;
        }
      }
    }while (true);
  },

  /*arrayChgLength: function(arr,defaultvalue,newlength){
    // multi dim: (arr,defaultvalue,dim1,dim2,...)
    if (arr == null) arr = [];
    var p = arguments;
    function setLength(a,argNo){
      var oldlen = a.length;
      var newlen = p[argNo];
      if (oldlen!==newlength){
        a.length = newlength;
        if (argNo === p.length-1){
          if (rtl.isArray(defaultvalue)){
            for (var i=oldlen; i<newlen; i++) a[i]=[]; // nested array
          } else if (rtl.isObject(defaultvalue)) {
            if (rtl.isTRecord(defaultvalue)){
              for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue.$new(); // e.g. record
            } else {
              for (var i=oldlen; i<newlen; i++) a[i]={}; // e.g. set
            }
          } else {
            for (var i=oldlen; i<newlen; i++) a[i]=defaultvalue;
          }
        } else {
          for (var i=oldlen; i<newlen; i++) a[i]=[]; // nested array
        }
      }
      if (argNo < p.length-1){
        // multi argNo
        for (var i=0; i<newlen; i++) a[i]=setLength(a[i],argNo+1);
      }
      return a;
    }
    return setLength(arr,2);
  },*/

  arrayEq: function(a,b){
    if (a===null) return b===null;
    if (b===null) return false;
    if (a.length!==b.length) return false;
    for (var i=0; i<a.length; i++) if (a[i]!==b[i]) return false;
    return true;
  },

  arrayClone: function(type,src,srcpos,endpos,dst,dstpos){
    // type: 0 for references, "refset" for calling refSet(), a function for new type()
    // src must not be null
    // This function does not range check.
    if(type === 'refSet') {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = rtl.refSet(src[srcpos]); // ref set
    } else if (rtl.isTRecord(type)){
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = type.$clone(src[srcpos]); // clone record
    }  else {
      for (; srcpos<endpos; srcpos++) dst[dstpos++] = src[srcpos]; // reference
    };
  },

  arrayConcat: function(type){
    // type: see rtl.arrayClone
    var a = [];
    var l = 0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src !== null) l+=src.length;
    };
    a.length = l;
    l=0;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      rtl.arrayClone(type,src,0,src.length,a,l);
      l+=src.length;
    };
    return a;
  },

  arrayConcatN: function(){
    var a = null;
    for (var i=1; i<arguments.length; i++){
      var src = arguments[i];
      if (src === null) continue;
      if (a===null){
        a=src; // Note: concat(a) does not clone
      } else {
        a=a.concat(src);
      }
    };
    return a;
  },

  arrayCopy: function(type, srcarray, index, count){
    // type: see rtl.arrayClone
    // if count is missing, use srcarray.length
    if (srcarray === null) return [];
    if (index < 0) index = 0;
    if (count === undefined) count=srcarray.length;
    var end = index+count;
    if (end>srcarray.length) end = srcarray.length;
    if (index>=end) return [];
    if (type===0){
      return srcarray.slice(index,end);
    } else {
      var a = [];
      a.length = end-index;
      rtl.arrayClone(type,srcarray,index,end,a,0);
      return a;
    }
  },

  setCharAt: function(s,index,c){
    return s.substr(0,index)+c+s.substr(index+1);
  },

  getResStr: function(mod,name){
    var rs = mod.$resourcestrings[name];
    return rs.current?rs.current:rs.org;
  },

  createSet: function(){
    var s = {};
    for (var i=0; i<arguments.length; i++){
      if (arguments[i]!=null){
        s[arguments[i]]=true;
      } else {
        var first=arguments[i+=1];
        var last=arguments[i+=1];
        for(var j=first; j<=last; j++) s[j]=true;
      }
    }
    return s;
  },

  cloneSet: function(s){
    var r = {};
    for (var key in s) r[key]=true;
    return r;
  },

  refSet: function(s){
    Object.defineProperty(s, '$shared', {
      enumerable: false,
      configurable: true,
      writable: true,
      value: true
    });
    return s;
  },

  includeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    s[enumvalue] = true;
    return s;
  },

  excludeSet: function(s,enumvalue){
    if (s.$shared) s = rtl.cloneSet(s);
    delete s[enumvalue];
    return s;
  },

  diffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    return r;
  },

  unionSet: function(s,t){
    var r = {};
    for (var key in s) r[key]=true;
    for (var key in t) r[key]=true;
    return r;
  },

  intersectSet: function(s,t){
    var r = {};
    for (var key in s) if (t[key]) r[key]=true;
    return r;
  },

  symDiffSet: function(s,t){
    var r = {};
    for (var key in s) if (!t[key]) r[key]=true;
    for (var key in t) if (!s[key]) r[key]=true;
    return r;
  },

  eqSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  neSet: function(s,t){
    return !rtl.eqSet(s,t);
  },

  leSet: function(s,t){
    for (var key in s) if (!t[key]) return false;
    return true;
  },

  geSet: function(s,t){
    for (var key in t) if (!s[key]) return false;
    return true;
  },

  strSetLength: function(s,newlen){
    var oldlen = s.length;
    if (oldlen > newlen){
      return s.substring(0,newlen);
    } else if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return s+' '.repeat(newlen-oldlen);
    } else {
       while (oldlen<newlen){
         s+=' ';
         oldlen++;
       };
       return s;
    }
  },

  spaceLeft: function(s,width){
    var l=s.length;
    if (l>=width) return s;
    if (s.repeat){
      // Note: repeat needs ECMAScript6!
      return ' '.repeat(width-l) + s;
    } else {
      while (l<width){
        s=' '+s;
        l++;
      };
      return s;
    };
  },

  floatToStr: function(d,w,p){
    // input 1-3 arguments: double, width, precision
    if (arguments.length>2){
      return rtl.spaceLeft(d.toFixed(p),w);
    } else {
	  // exponent width
	  var pad = "";
	  var ad = Math.abs(d);
	  if (ad<1.0e+10) {
		pad='00';
	  } else if (ad<1.0e+100) {
		pad='0';
      }  	
	  if (arguments.length<2) {
	    w=9;		
      } else if (w<9) {
		w=9;
      }		  
      var p = w-8;
      var s=(d>0 ? " " : "" ) + d.toExponential(p);
      s=s.replace(/e(.)/,'E$1'+pad);
      return rtl.spaceLeft(s,w);
    }
  },

  valEnum: function(s, enumType, setCodeFn){
    s = s.toLowerCase();
    for (var key in enumType){
      if((typeof(key)==='string') && (key.toLowerCase()===s)){
        setCodeFn(0);
        return enumType[key];
      }
    }
    setCodeFn(1);
    return 0;
  },

  lw: function(l){
    // fix longword bitwise operation
    return l<0?l+0x100000000:l;
  },

  and: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) & (b / hi);
    var l = (a & low) & (b & low);
    return h*hi + l;
  },

  or: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) | (b / hi);
    var l = (a & low) | (b & low);
    return h*hi + l;
  },

  xor: function(a,b){
    var hi = 0x80000000;
    var low = 0x7fffffff;
    var h = (a / hi) ^ (b / hi);
    var l = (a & low) ^ (b & low);
    return h*hi + l;
  },

  shr: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (a<0x80000000) return a >> b;
    if (b<=0) return a;
    if (b>54) return 0;
    return Math.floor(a / Math.pow(2,b));
  },

  shl: function(a,b){
    if (a<0) a += rtl.hiInt;
    if (b<=0) return a;
    if (b>54) return 0;
    var r = a * Math.pow(2,b);
    if (r <= rtl.hiInt) return r;
    return r % rtl.hiInt;
  },

  initRTTI: function(){
    if (rtl.debug_rtti) rtl.debug('initRTTI');

    // base types
    rtl.tTypeInfo = { name: "tTypeInfo" };
    function newBaseTI(name,kind,ancestor){
      if (!ancestor) ancestor = rtl.tTypeInfo;
      if (rtl.debug_rtti) rtl.debug('initRTTI.newBaseTI "'+name+'" '+kind+' ("'+ancestor.name+'")');
      var t = Object.create(ancestor);
      t.name = name;
      t.kind = kind;
      rtl[name] = t;
      return t;
    };
    function newBaseInt(name,minvalue,maxvalue,ordtype){
      var t = newBaseTI(name,1 /* tkInteger */,rtl.tTypeInfoInteger);
      t.minvalue = minvalue;
      t.maxvalue = maxvalue;
      t.ordtype = ordtype;
      return t;
    };
    newBaseTI("tTypeInfoInteger",1 /* tkInteger */);
    newBaseInt("shortint",-0x80,0x7f,0);
    newBaseInt("byte",0,0xff,1);
    newBaseInt("smallint",-0x8000,0x7fff,2);
    newBaseInt("word",0,0xffff,3);
    newBaseInt("longint",-0x80000000,0x7fffffff,4);
    newBaseInt("longword",0,0xffffffff,5);
    newBaseInt("nativeint",-0x10000000000000,0xfffffffffffff,6);
    newBaseInt("nativeuint",0,0xfffffffffffff,7);
    newBaseTI("char",2 /* tkChar */);
    newBaseTI("string",3 /* tkString */);
    newBaseTI("tTypeInfoEnum",4 /* tkEnumeration */,rtl.tTypeInfoInteger);
    newBaseTI("tTypeInfoSet",5 /* tkSet */);
    newBaseTI("double",6 /* tkDouble */);
    newBaseTI("boolean",7 /* tkBool */);
    newBaseTI("tTypeInfoProcVar",8 /* tkProcVar */);
    newBaseTI("tTypeInfoMethodVar",9 /* tkMethod */,rtl.tTypeInfoProcVar);
    newBaseTI("tTypeInfoArray",10 /* tkArray */);
    newBaseTI("tTypeInfoDynArray",11 /* tkDynArray */);
    newBaseTI("tTypeInfoPointer",15 /* tkPointer */);
    var t = newBaseTI("pointer",15 /* tkPointer */,rtl.tTypeInfoPointer);
    t.reftype = null;
    newBaseTI("jsvalue",16 /* tkJSValue */);
    newBaseTI("tTypeInfoRefToProcVar",17 /* tkRefToProcVar */,rtl.tTypeInfoProcVar);

    // member kinds
    rtl.tTypeMember = {};
    function newMember(name,kind){
      var m = Object.create(rtl.tTypeMember);
      m.name = name;
      m.kind = kind;
      rtl[name] = m;
    };
    newMember("tTypeMemberField",1); // tmkField
    newMember("tTypeMemberMethod",2); // tmkMethod
    newMember("tTypeMemberProperty",3); // tmkProperty

    // base object for storing members: a simple object
    rtl.tTypeMembers = {};

    // tTypeInfoStruct - base object for tTypeInfoClass, tTypeInfoRecord, tTypeInfoInterface
    var tis = newBaseTI("tTypeInfoStruct",0);
    tis.$addMember = function(name,ancestor,options){
      if (rtl.debug_rtti){
        if (!rtl.hasString(name) || (name.charAt()==='$')) throw 'invalid member "'+name+'", this="'+this.name+'"';
        if (!rtl.is(ancestor,rtl.tTypeMember)) throw 'invalid ancestor "'+ancestor+':'+ancestor.name+'", "'+this.name+'.'+name+'"';
        if ((options!=undefined) && (typeof(options)!='object')) throw 'invalid options "'+options+'", "'+this.name+'.'+name+'"';
      };
      var t = Object.create(ancestor);
      t.name = name;
      this.members[name] = t;
      this.names.push(name);
      if (rtl.isObject(options)){
        for (var key in options) if (options.hasOwnProperty(key)) t[key] = options[key];
      };
      return t;
    };
    tis.addField = function(name,type,options){
      var t = this.$addMember(name,rtl.tTypeMemberField,options);
      if (rtl.debug_rtti){
        if (!rtl.is(type,rtl.tTypeInfo)) throw 'invalid type "'+type+'", "'+this.name+'.'+name+'"';
      };
      t.typeinfo = type;
      this.fields.push(name);
      return t;
    };
    tis.addFields = function(){
      var i=0;
      while(i<arguments.length){
        var name = arguments[i++];
        var type = arguments[i++];
        if ((i<arguments.length) && (typeof(arguments[i])==='object')){
          this.addField(name,type,arguments[i++]);
        } else {
          this.addField(name,type);
        };
      };
    };
    tis.addMethod = function(name,methodkind,params,result,options){
      var t = this.$addMember(name,rtl.tTypeMemberMethod,options);
      t.methodkind = methodkind;
      t.procsig = rtl.newTIProcSig(params);
      t.procsig.resulttype = result?result:null;
      this.methods.push(name);
      return t;
    };
    tis.addProperty = function(name,flags,result,getter,setter,options){
      var t = this.$addMember(name,rtl.tTypeMemberProperty,options);
      t.flags = flags;
      t.typeinfo = result;
      t.getter = getter;
      t.setter = setter;
      // Note: in options: params, stored, defaultvalue
      if (rtl.isArray(t.params)) t.params = rtl.newTIParams(t.params);
      this.properties.push(name);
      if (!rtl.isString(t.stored)) t.stored = "";
      return t;
    };
    tis.getField = function(index){
      return this.members[this.fields[index]];
    };
    tis.getMethod = function(index){
      return this.members[this.methods[index]];
    };
    tis.getProperty = function(index){
      return this.members[this.properties[index]];
    };

    newBaseTI("tTypeInfoRecord",12 /* tkRecord */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClass",13 /* tkClass */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoClassRef",14 /* tkClassRef */);
    newBaseTI("tTypeInfoInterface",18 /* tkInterface */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoHelper",19 /* tkHelper */,rtl.tTypeInfoStruct);
    newBaseTI("tTypeInfoExtClass",20 /* tkExtClass */,rtl.tTypeInfoClass);
  },

  tSectionRTTI: {
    $module: null,
    $inherited: function(name,ancestor,o){
      if (rtl.debug_rtti){
        rtl.debug('tSectionRTTI.newTI "'+(this.$module?this.$module.$name:"(no module)")
          +'"."'+name+'" ('+ancestor.name+') '+(o?'init':'forward'));
      };
      var t = this[name];
      if (t){
        if (!t.$forward) throw 'duplicate type "'+name+'"';
        if (!ancestor.isPrototypeOf(t)) throw 'typeinfo ancestor mismatch "'+name+'" ancestor="'+ancestor.name+'" t.name="'+t.name+'"';
      } else {
        t = Object.create(ancestor);
        t.name = name;
        t.$module = this.$module;
        this[name] = t;
      }
      if (o){
        delete t.$forward;
        for (var key in o) if (o.hasOwnProperty(key)) t[key]=o[key];
      } else {
        t.$forward = true;
      }
      return t;
    },
    $Scope: function(name,ancestor,o){
      var t=this.$inherited(name,ancestor,o);
      t.members = {};
      t.names = [];
      t.fields = [];
      t.methods = [];
      t.properties = [];
      return t;
    },
    $TI: function(name,kind,o){ var t=this.$inherited(name,rtl.tTypeInfo,o); t.kind = kind; return t; },
    $Int: function(name,o){ return this.$inherited(name,rtl.tTypeInfoInteger,o); },
    $Enum: function(name,o){ return this.$inherited(name,rtl.tTypeInfoEnum,o); },
    $Set: function(name,o){ return this.$inherited(name,rtl.tTypeInfoSet,o); },
    $StaticArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoArray,o); },
    $DynArray: function(name,o){ return this.$inherited(name,rtl.tTypeInfoDynArray,o); },
    $ProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoProcVar,o); },
    $RefToProcVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoRefToProcVar,o); },
    $MethodVar: function(name,o){ return this.$inherited(name,rtl.tTypeInfoMethodVar,o); },
    $Record: function(name,o){ return this.$Scope(name,rtl.tTypeInfoRecord,o); },
    $Class: function(name,o){ return this.$Scope(name,rtl.tTypeInfoClass,o); },
    $ClassRef: function(name,o){ return this.$inherited(name,rtl.tTypeInfoClassRef,o); },
    $Pointer: function(name,o){ return this.$inherited(name,rtl.tTypeInfoPointer,o); },
    $Interface: function(name,o){ return this.$Scope(name,rtl.tTypeInfoInterface,o); },
    $Helper: function(name,o){ return this.$Scope(name,rtl.tTypeInfoHelper,o); },
    $ExtClass: function(name,o){ return this.$Scope(name,rtl.tTypeInfoExtClass,o); }
  },

  newTIParam: function(param){
    // param is an array, 0=name, 1=type, 2=optional flags
    var t = {
      name: param[0],
      typeinfo: param[1],
      flags: (rtl.isNumber(param[2]) ? param[2] : 0)
    };
    return t;
  },

  newTIParams: function(list){
    // list: optional array of [paramname,typeinfo,optional flags]
    var params = [];
    if (rtl.isArray(list)){
      for (var i=0; i<list.length; i++) params.push(rtl.newTIParam(list[i]));
    };
    return params;
  },

  newTIProcSig: function(params,result,flags){
    var s = {
      params: rtl.newTIParams(params),
      resulttype: result,
      flags: flags
    };
    return s;
  },

  addResource: function(aRes){
    rtl.$res[aRes.name]=aRes;
  },

  getResource: function(aName){
    var res = rtl.$res[aName];
    if (res !== undefined) {
      return res;
    } else {
      return null;
    }
  },

  getResourceList: function(){
    return Object.keys(rtl.$res);
  },
  
  getHTMLTemplateResource: async function(a, c, e, d, f) {
	var b, l, h, k, m, p, u, t, w, n, q, x;
	  u = await fetch(a);
	  t = await u.text();	
	  w = new DOMParser;
	  n = w.parseFromString(t, "text/html");
	  b = n.head;
	  if (null != b) {
		l = b.getElementsByTagName("script");
		try {
		  if (null != l) {
			for (q = 0, x = l.length - 1; q <= x; q++) {
			  h = q;
			  k = l.item(h);
			  m = k.getAttributeNode("data-type");
			  p = k.getAttributeNode("data-name");
			  var g;
			  if (g = null != m && null != p) {
				var r = c;
				g = m.value.toUpperCase() == r.toUpperCase();
			  }
			  var t;
			  if (t = g) {
				r = e, t = p.value.toUpperCase() == r.toUpperCase();
			  }
			  if (t) {
				null != d && d(k.textContent);
				break;
			  }
			}
		  }
		} finally {
		  l = null;
		}
	  }   
  }	  
}

rtl.addResource({name: "testres", unit: "projhtmltemplateresource", format: "text/html", encoding: "base64", data: "PGgzPlRlc3QgcmVzb3VyY2UgaW4gSFRNTDwvaDM+ClRoaXMgaXMgYSBtYWluIHByb2dyYW0gZmlsZSByZXNvdXJjZSBpbiBIVE1MLgo="});
rtl.addResource({name: "testb", unit: "unitb", format: "text/html", encoding: "base64", data: "PGgzPkhlbGxvIFJlc291cmNlIFdvcmxkIFBhcnQgQjwvaDM+CjxwPgpUaGlzIG1lc3NhZ2UgaXMgc2F2ZWQgaW4gYSByZXNvdXJjZSBmaWxlIChQYXJ0IEIpLgo8L3A+Cgo="});
rtl.addResource({name: "testa", unit: "unita", format: "text/html", encoding: "base64", data: "PGgzPkhlbGxvIFJlc291cmNlIFdvcmxkIFBhcnQgQTwvaDM+CjxwPgpUaGlzIG1lc3NhZ2UgaXMgc2F2ZWQgaW4gYSByZXNvdXJjZSBmaWxlIChQYXJ0IEEpLgo8L3A+Cgo="});
rtl.module("System",[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.Copy = function (S, Index, Size) {
    if (Index<1) Index = 1;
    return (Size>0) ? S.substring(Index-1,Index+Size-1) : "";
  };
  this.Copy$1 = function (S, Index) {
    if (Index<1) Index = 1;
    return S.substr(Index-1);
  };
  this.Delete = function (S, Index, Size) {
    var h = "";
    if ((Index < 1) || (Index > S.get().length) || (Size <= 0)) return;
    h = S.get();
    S.set($mod.Copy(h,1,Index - 1) + $mod.Copy$1(h,Index + Size));
  };
  this.Pos = function (Search, InString) {
    return InString.indexOf(Search)+1;
  };
  this.Writeln = function () {
    var i = 0;
    var l = 0;
    var s = "";
    l = arguments.length - 1;
    if ($impl.WriteCallBack != null) {
      for (var $l1 = 0, $end2 = l; $l1 <= $end2; $l1++) {
        i = $l1;
        $impl.WriteCallBack(arguments[i],i === l);
      };
    } else {
      s = $impl.WriteBuf;
      for (var $l3 = 0, $end4 = l; $l3 <= $end4; $l3++) {
        i = $l3;
        s = s + ("" + arguments[i]);
      };
      console.log(s);
      $impl.WriteBuf = "";
    };
  };
  this.SetWriteCallBack = function (H) {
    var Result = null;
    Result = $impl.WriteCallBack;
    $impl.WriteCallBack = H;
    return Result;
  };
  $mod.$init = function () {
    rtl.exitcode = 0;
  };
},null,function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.WriteBuf = "";
  $impl.WriteCallBack = null;
});
rtl.module("Types",["System"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("JS",["System","Types"],function () {
  "use strict";
  var $mod = this;
  this.isDefined = function (v) {
    return !(v == undefined);
  };
});
rtl.module("Web",["System","Types","JS"],function () {
  "use strict";
  var $mod = this;
});
rtl.module("SysUtils",["System","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.LowerCase = function (s) {
    return s.toLowerCase();
  };
  this.SameText = function (s1, s2) {
    return s1.toLowerCase() == s2.toLowerCase();
  };
  this.TStringReplaceFlag = {"0": "rfReplaceAll", rfReplaceAll: 0, "1": "rfIgnoreCase", rfIgnoreCase: 1};
  this.StringReplace = function (aOriginal, aSearch, aReplace, Flags) {
    var Result = "";
    var REFlags = "";
    var REString = "";
    REFlags = "";
    if (0 in Flags) REFlags = "g";
    if (1 in Flags) REFlags = REFlags + "i";
    REString = aSearch.replace(new RegExp($impl.RESpecials,"g"),"\\$1");
    Result = aOriginal.replace(new RegExp(REString,REFlags),aReplace);
    return Result;
  };
},null,function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.RESpecials = "([\\$\\+\\[\\]\\(\\)\\\\\\.\\*\\^])";
});
rtl.module("browserconsole",["System","JS","Web","SysUtils"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.BrowserLineBreak = "\n";
  this.DefaultMaxConsoleLines = 25;
  this.DefaultConsoleStyle = ".pasconsole { " + $mod.BrowserLineBreak + "font-family: courier;" + $mod.BrowserLineBreak + "font-size: 14px;" + $mod.BrowserLineBreak + "background: #FFFFFF;" + $mod.BrowserLineBreak + "color: #000000;" + $mod.BrowserLineBreak + "display: block;" + $mod.BrowserLineBreak + "}";
  this.ConsoleElementID = "";
  this.ConsoleStyle = "";
  this.MaxConsoleLines = 0;
  this.ConsoleLinesToBrowserLog = false;
  this.ResetConsole = function () {
    if ($impl.LinesParent === null) return;
    while ($impl.LinesParent.firstElementChild !== null) $impl.LinesParent.removeChild($impl.LinesParent.firstElementChild);
    $impl.AppendLine();
  };
  this.InitConsole = function () {
    if ($impl.ConsoleElement === null) return;
    if ($impl.ConsoleElement.nodeName.toLowerCase() !== "body") {
      while ($impl.ConsoleElement.firstElementChild !== null) $impl.ConsoleElement.removeChild($impl.ConsoleElement.firstElementChild);
    };
    $impl.StyleElement = document.createElement("style");
    $impl.StyleElement.innerText = $mod.ConsoleStyle;
    $impl.ConsoleElement.appendChild($impl.StyleElement);
    $impl.LinesParent = document.createElement("div");
    $impl.ConsoleElement.appendChild($impl.LinesParent);
  };
  this.HookConsole = function () {
    $impl.ConsoleElement = null;
    if ($mod.ConsoleElementID !== "") $impl.ConsoleElement = document.getElementById($mod.ConsoleElementID);
    if ($impl.ConsoleElement === null) $impl.ConsoleElement = document.body;
    if ($impl.ConsoleElement === null) return;
    $mod.InitConsole();
    $mod.ResetConsole();
    pas.System.SetWriteCallBack($impl.WriteConsole);
  };
  $mod.$init = function () {
    $mod.ConsoleLinesToBrowserLog = true;
    $mod.ConsoleElementID = "pasjsconsole";
    $mod.ConsoleStyle = $mod.DefaultConsoleStyle;
    $mod.MaxConsoleLines = 25;
    $mod.HookConsole();
  };
},null,function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.LastLine = null;
  $impl.StyleElement = null;
  $impl.LinesParent = null;
  $impl.ConsoleElement = null;
  $impl.AppendLine = function () {
    var CurrentCount = 0;
    var S = null;
    CurrentCount = 0;
    S = $impl.LinesParent.firstChild;
    while (S != null) {
      CurrentCount += 1;
      S = S.nextSibling;
    };
    while (CurrentCount > $mod.MaxConsoleLines) {
      CurrentCount -= 1;
      $impl.LinesParent.removeChild($impl.LinesParent.firstChild);
    };
    $impl.LastLine = document.createElement("div");
    $impl.LastLine.className = "pasconsole";
    $impl.LinesParent.appendChild($impl.LastLine);
  };
  $impl.WriteConsole = function (S, NewLine) {
    var CL = "";
    CL = $impl.LastLine.innerHTML;
    CL = CL + ("" + S);
    CL = pas.SysUtils.StringReplace(CL,"<","&lt;",rtl.createSet(0));
    CL = pas.SysUtils.StringReplace(CL,">","&gt;",rtl.createSet(0));
    CL = pas.SysUtils.StringReplace(CL," ","&nbsp;",rtl.createSet(0));
    CL = pas.SysUtils.StringReplace(CL,"\r\n","<br>",rtl.createSet(0));
    CL = pas.SysUtils.StringReplace(CL,"\n","<br>",rtl.createSet(0));
    CL = pas.SysUtils.StringReplace(CL,"\r","<br>",rtl.createSet(0));
    $impl.LastLine.innerHTML = CL;
    if (NewLine) {
      if ($mod.ConsoleLinesToBrowserLog) window.console.log($impl.LastLine.innerText);
      $impl.AppendLine();
    };
  };
});
rtl.module("Classes",["System","Types","SysUtils","JS"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $mod.$init = function () {
    $impl.ClassList = Object.create(null);
  };
},[],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.ClassList = null;
});
rtl.module("p2jsres",["System","Types"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  this.TResourceSource = {"0": "rsJS", rsJS: 0, "1": "rsHTML", rsHTML: 1};
  rtl.recNewT($mod,"TResourceInfo",function () {
    this.name = "";
    this.encoding = "";
    this.resourceunit = "";
    this.format = "";
    this.data = "";
    this.$eq = function (b) {
      return (this.name === b.name) && (this.encoding === b.encoding) && (this.resourceunit === b.resourceunit) && (this.format === b.format) && (this.data === b.data);
    };
    this.$assign = function (s) {
      this.name = s.name;
      this.encoding = s.encoding;
      this.resourceunit = s.resourceunit;
      this.format = s.format;
      this.data = s.data;
      return this;
    };
  });
  this.SetResourceSource = function (aSource) {
    var Result = 0;
    Result = $impl.gMode;
    $impl.gMode = aSource;
    return Result;
  };
  this.GetResourceNames = function () {
    var Result = [];
    Result = $mod.GetResourceNames$1($impl.gMode);
    return Result;
  };
  this.GetResourceNames$1 = function (aSource) {
    var Result = [];
    var $tmp1 = aSource;
    if ($tmp1 === 0) {
      Result = rtl.getResourceList()}
     else if ($tmp1 === 1) Result = $impl.GetHTMLResources();
    return Result;
  };
  this.GetResourceInfo = function (aName, aInfo) {
    var Result = false;
    Result = $mod.GetResourceInfo$1($impl.gMode,aName,aInfo);
    return Result;
  };
  this.GetResourceInfo$1 = function (aSource, aName, aInfo) {
    var Result = false;
    var $tmp1 = aSource;
    if ($tmp1 === 0) {
      Result = $impl.GetRTLResourceInfo(aName,aInfo)}
     else if ($tmp1 === 1) Result = $impl.GetHTMLResourceInfo(aName,aInfo);
    return Result;
  };
},["SysUtils","JS","Web"],function () {
  "use strict";
  var $mod = this;
  var $impl = $mod.$impl;
  $impl.gMode = 0;
  $impl.GetRTLResourceInfo = function (aName, aInfo) {
    var Result = false;
    var RTLInfo = null;
    RTLInfo = rtl.getResource(pas.SysUtils.LowerCase(aName));
    Result = RTLInfo != null;
    if (Result) {
      aInfo.name = RTLInfo.name;
      aInfo.encoding = RTLInfo.encoding;
      aInfo.format = RTLInfo.format;
      aInfo.resourceunit = RTLInfo.unit;
      aInfo.data = RTLInfo.data;
    };
    return Result;
  };
  $impl.IDPrefix = "resource-";
  $impl.IsResourceLink = function (L) {
    var Result = false;
    Result = (pas.System.Copy(L.id,1,$impl.IDPrefix.length) === $impl.IDPrefix) && pas.JS.isDefined(L.dataset["unit"]) && (pas.System.Copy(L.href,1,4) === "data");
    return Result;
  };
  $impl.GetHTMLResources = function () {
    var Result = [];
    var LC = null;
    var L = null;
    var I = 0;
    var ID = "";
    Result = rtl.arraySetLength(Result,"",0);
    if (!pas.JS.isDefined(document)) return Result;
    LC = document.getElementsByTagName("link");
    for (var $l1 = 0, $end2 = LC.length - 1; $l1 <= $end2; $l1++) {
      I = $l1;
      L = LC.item(I);
      ID = L.id;
      if ($impl.IsResourceLink(L)) {
        pas.System.Delete({get: function () {
            return ID;
          }, set: function (v) {
            ID = v;
          }},1,$impl.IDPrefix.length);
        if (ID !== "") Result.push(ID);
      };
    };
    return Result;
  };
  $impl.GetHTMLResourceInfo = function (aName, aInfo) {
    var Result = false;
    var el = null;
    var S = "";
    var I = 0;
    Result = false;
    if (!pas.JS.isDefined(document)) return Result;
    el = document.getElementById($impl.IDPrefix + pas.SysUtils.LowerCase(aName));
    Result = (el != null) && pas.SysUtils.SameText(el.tagName,"link");
    if (!Result) return Result;
    aInfo.name = pas.SysUtils.LowerCase(aName);
    aInfo.resourceunit = "" + el.dataset["unit"];
    S = el.href;
    S = pas.System.Copy(S,6,S.length - 5);
    I = pas.System.Pos(",",S);
    aInfo.data = pas.System.Copy(S,I + 1,S.length - 1);
    S = pas.System.Copy(S,1,I - 1);
    I = pas.System.Pos(";",S);
    if (I === 0) {
      aInfo.encoding = ""}
     else {
      aInfo.encoding = pas.System.Copy(S,I + 1,S.length - 1);
      S = pas.System.Copy(S,1,I - 1);
    };
    aInfo.format = S;
    return Result;
  };
});
rtl.module("program",["System","browserconsole","JS","Classes","SysUtils","Types","p2jsres","Web"],function () {
  "use strict";
  var $mod = this;
  this.OnLoaded = function (html) {
    var El = null;
    window.console.log("onLoaded");
    El = document.getElementById("playarea");
    El.innerHTML = html;
  };
  this.OnLoadFailed = function (aError) {
    window.console.log("Failed to load resources : " + aError);
  };
  this.DoOnClick = function (aEvent) {
    var Result = false;
    var el = null;
    Result = false;
    el = document.getElementById("playarea");
    rtl.getHTMLTemplateResource("htmlloadlinkdemo-res.html","interface","pas2js2",$mod.OnLoaded,$mod.OnLoadFailed);
    return Result;
  };
  this.RL = [];
  this.aInfo = pas.p2jsres.TResourceInfo.$new();
  this.el = null;
  this.S = "";
  $mod.$main = function () {
    pas.System.Writeln("Javascript embedded resources:");
    pas.p2jsres.SetResourceSource(0);
    $mod.RL = pas.p2jsres.GetResourceNames();
    for (var $in1 = $mod.RL, $l2 = 0, $end3 = rtl.length($in1) - 1; $l2 <= $end3; $l2++) {
      $mod.S = $in1[$l2];
      pas.System.Writeln("--- Found resource name: ",$mod.S," : ");
      if (!pas.p2jsres.GetResourceInfo($mod.S,$mod.aInfo)) {
        pas.System.Writeln("No extra information for resource ",$mod.S," available !")}
       else {
        pas.System.Writeln("Name: ",$mod.aInfo.name);
        pas.System.Writeln("Format: ",$mod.aInfo.format);
        pas.System.Writeln("encoding: ",$mod.aInfo.encoding);
        pas.System.Writeln("unit: ",$mod.aInfo.resourceunit);
        pas.System.Writeln("data length: ",$mod.aInfo.data.length);
      };
    };
    $mod.el = document.getElementById("doinsert");
    $mod.el.onclick = $mod.DoOnClick;
  };
});
//# sourceMappingURL=projhtmltemplateresource.js.map
