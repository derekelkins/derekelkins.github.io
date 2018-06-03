var ndjs = (function (exports) {
    'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __makeTemplateObject(cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    }

    const G = document.defaultView;

    // Node.CONSTANTS
    // 'cause some engine has no global Node defined
    // (i.e. Node, NativeScript, basicHTML ... )
    const ELEMENT_NODE = 1;
    const TEXT_NODE = 3;
    const COMMENT_NODE = 8;
    const DOCUMENT_FRAGMENT_NODE = 11;

    // HTML related constants
    const VOID_ELEMENTS = /^area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr$/i;

    // SVG related constants
    const OWNER_SVG_ELEMENT = 'ownerSVGElement';
    const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

    // Custom Elements / MutationObserver constants
    const CONNECTED = 'connected';
    const DISCONNECTED = 'dis' + CONNECTED;

    // hyperHTML related constants
    const EXPANDO = '_hyper: ';
    const SHOULD_USE_TEXT_CONTENT = /^style|textarea$/i;
    const UID = EXPANDO + ((Math.random() * new Date) | 0) + ';';
    const UIDC = '<!--' + UID + '-->';

    // you know that kind of basics you need to cover
    // your use case only but you don't want to bloat the library?
    // There's even a package in here:
    // https://www.npmjs.com/package/poorlyfills

    // used to dispatch simple events
    let Event = G.Event;
    try {
      new Event('Event');
    } catch(o_O) {
      Event = function (type) {
        const e = document.createEvent('Event');
        e.initEvent(type, false, false);
        return e;
      };
    }

    // used to store template literals
    /* istanbul ignore next */
    const Map = G.Map || function Map() {
      const keys = [], values = [];
      return {
        get(obj) {
          return values[keys.indexOf(obj)];
        },
        set(obj, value) {
          values[keys.push(obj) - 1] = value;
        }
      };
    };

    // used to store wired content
    let ID = 0;
    const WeakMap$1 = G.WeakMap || function WeakMap() {
      const key = UID + ID++;
      return {
        get(obj) { return obj[key]; },
        set(obj, value) {
          Object.defineProperty(obj, key, {
            configurable: true,
            value
          });
        }
      };
    };

    // used to store hyper.Components
    const WeakSet = G.WeakSet || function WeakSet() {
      const wm = new WeakMap$1;
      return {
        add(obj) { wm.set(obj, true); },
        has(obj) { return wm.get(obj) === true; }
      };
    };

    // used to be sure IE9 or older Androids work as expected
    const isArray = Array.isArray || (toString =>
      arr => toString.call(arr) === '[object Array]'
    )({}.toString);

    const trim = UID.trim || function () {
      return this.replace(/^\s+|\s+$/g, '');
    };

    // hyperHTML.Component is a very basic class
    // able to create Custom Elements like components
    // including the ability to listen to connect/disconnect
    // events via onconnect/ondisconnect attributes
    // Components can be created imperatively or declaratively.
    // The main difference is that declared components
    // will not automatically render on setState(...)
    // to simplify state handling on render.
    function Component() {
      return this; // this is needed in Edge !!!
    }

    // Component is lazily setup because it needs
    // wire mechanism as lazy content
    function setup(content) {
      // there are various weakly referenced variables in here
      // and mostly are to use Component.for(...) static method.
      const children = new WeakMap$1;
      const create = Object.create;
      const createEntry = (wm, id, component) => {
        wm.set(id, component);
        return component;
      };
      const get = (Class, info, context, id) => {
        const relation = info.get(Class) || relate(Class, info);
        switch (typeof id) {
          case 'object':
          case 'function':
            const wm = relation.w || (relation.w = new WeakMap$1);
            return wm.get(id) || createEntry(wm, id, new Class(context));
          default:
            const sm = relation.p || (relation.p = create(null));
            return sm[id] || (sm[id] = new Class(context));
        }
      };
      const relate = (Class, info) => {
        const relation = {w: null, p: null};
        info.set(Class, relation);
        return relation;
      };
      const set = context => {
        const info = new Map;
        children.set(context, info);
        return info;
      };
      // The Component Class
      Object.defineProperties(
        Component,
        {
          // Component.for(context[, id]) is a convenient way
          // to automatically relate data/context to children components
          // If not created yet, the new Component(context) is weakly stored
          // and after that same instance would always be returned.
          for: {
            configurable: true,
            value(context, id) {
              return get(
                this,
                children.get(context) || set(context),
                context,
                id == null ?
                  'default' : id
              );
            }
          }
        }
      );
      Object.defineProperties(
        Component.prototype,
        {
          // all events are handled with the component as context
          handleEvent: {value(e) {
            const ct = e.currentTarget;
            this[
              ('getAttribute' in ct && ct.getAttribute('data-call')) ||
              ('on' + e.type)
            ](e);
          }},
          // components will lazily define html or svg properties
          // as soon as these are invoked within the .render() method
          // Such render() method is not provided by the base class
          // but it must be available through the Component extend.
          // Declared components could implement a
          // render(props) method too and use props as needed.
          html: lazyGetter('html', content),
          svg: lazyGetter('svg', content),
          // the state is a very basic/simple mechanism inspired by Preact
          state: lazyGetter('state', function () { return this.defaultState; }),
          // it is possible to define a default state that'd be always an object otherwise
          defaultState: {get() { return {}; }},
          // setting some property state through a new object
          // or a callback, triggers also automatically a render
          // unless explicitly specified to not do so (render === false)
          setState: {value(state, render) {
            const target = this.state;
            const source = typeof state === 'function' ? state.call(this, target) : state;
            for (const key in source) target[key] = source[key];
            if (render !== false) this.render();
            return this;
          }}
        }
      );
    }

    // instead of a secret key I could've used a WeakMap
    // However, attaching a property directly will result
    // into better performance with thousands of components
    // hanging around, and less memory pressure caused by the WeakMap
    const lazyGetter = (type, fn) => {
      const secret = '_' + type + '$';
      return {
        get() {
          return this[secret] || (this[type] = fn.call(this, type));
        },
        set(value) {
          Object.defineProperty(this, secret, {configurable: true, value});
        }
      };
    };

    const intents = {};
    const keys = [];
    const hasOwnProperty = intents.hasOwnProperty;

    let length = 0;

    var Intent = {

      // hyperHTML.define('intent', (object, update) => {...})
      // can be used to define a third parts update mechanism
      // when every other known mechanism failed.
      // hyper.define('user', info => info.name);
      // hyper(node)`<p>${{user}}</p>`;
      define: (intent, callback) => {
        if (!(intent in intents)) {
          length = keys.push(intent);
        }
        intents[intent] = callback;
      },

      // this method is used internally as last resort
      // to retrieve a value out of an object
      invoke: (object, callback) => {
        for (let i = 0; i < length; i++) {
          let key = keys[i];
          if (hasOwnProperty.call(object, key)) {
            return intents[key](object[key], callback);
          }
        }
      }
    };

    // these are tiny helpers to simplify most common operations needed here
    const create = (node, type) => doc(node).createElement(type);
    const doc = node => node.ownerDocument || node;
    const fragment = node => doc(node).createDocumentFragment();
    const text = (node, text) => doc(node).createTextNode(text);

    // TODO:  I'd love to code-cover RegExp too here
    //        these are fundamental for this library

    const spaces = ' \\f\\n\\r\\t';
    const almostEverything = '[^ ' + spaces + '\\/>"\'=]+';
    const attrName = '[ ' + spaces + ']+' + almostEverything;
    const tagName = '<([A-Za-z]+[A-Za-z0-9:_-]*)((?:';
    const attrPartials = '(?:=(?:\'[^\']*?\'|"[^"]*?"|<[^>]*?>|' + almostEverything + '))?)';

    const attrSeeker = new RegExp(
      tagName + attrName + attrPartials + '+)([ ' + spaces + ']*/?>)',
      'g'
    );

    const selfClosing = new RegExp(
      tagName + attrName + attrPartials + '*)([ ' + spaces + ']*/>)',
      'g'
    );

    const testFragment = fragment(document);

    // DOM4 node.append(...many)
    const hasAppend = 'append' in testFragment;

    // detect old browsers without HTMLTemplateElement content support
    const hasContent = 'content' in create(document, 'template');

    // IE 11 has problems with cloning templates: it "forgets" empty childNodes
    testFragment.appendChild(text(testFragment, 'g'));
    testFragment.appendChild(text(testFragment, ''));
    const hasDoomedCloneNode = testFragment.cloneNode(true).childNodes.length === 1;

    // old browsers need to fallback to cloneNode
    // Custom Elements V0 and V1 will work polyfilled
    // but native implementations need importNode instead
    // (specially Chromium and its old V0 implementation)
    const hasImportNode = 'importNode' in document;

    // appends an array of nodes
    // to a generic node/fragment
    // When available, uses append passing all arguments at once
    // hoping that's somehow faster, even if append has more checks on type
    const append = hasAppend ?
      (node, childNodes) => {
        node.append.apply(node, childNodes);
      } :
      (node, childNodes) => {
        const length = childNodes.length;
        for (let i = 0; i < length; i++) {
          node.appendChild(childNodes[i]);
        }
      };

    const findAttributes = new RegExp('(' + attrName + '=)([\'"]?)' + UIDC + '\\2', 'gi');
    const comments = ($0, $1, $2, $3) =>
      '<' + $1 + $2.replace(findAttributes, replaceAttributes) + $3;
    const replaceAttributes = ($0, $1, $2) => $1 + ($2 || '"') + UID + ($2 || '"');

    // given a node and a generic HTML content,
    // create either an SVG or an HTML fragment
    // where such content will be injected
    const createFragment = (node, html) =>
      (OWNER_SVG_ELEMENT in node ?
        SVGFragment :
        HTMLFragment
      )(node, html.replace(attrSeeker, comments));

    // IE/Edge shenanigans proof cloneNode
    // it goes through all nodes manually
    // instead of relying the engine to suddenly
    // merge nodes together
    const cloneNode = hasDoomedCloneNode ?
      node => {
        const clone = node.cloneNode();
        const childNodes = node.childNodes ||
                          // this is an excess of caution
                          // but some node, in IE, might not
                          // have childNodes property.
                          // The following fallback ensure working code
                          // in older IE without compromising performance
                          // or any other browser/engine involved.
                          /* istanbul ignore next */
                          [];
        const length = childNodes.length;
        for (let i = 0; i < length; i++) {
          clone.appendChild(cloneNode(childNodes[i]));
        }
        return clone;
      } :
      // the following ignore is due code-coverage
      // combination of not having document.importNode
      // but having a working node.cloneNode.
      // This shenario is common on older Android/WebKit browsers
      // but basicHTML here tests just two major cases:
      // with document.importNode or with broken cloneNode.
      /* istanbul ignore next */
      node => node.cloneNode(true);

    // used to import html into fragments
    const importNode = hasImportNode ?
      (doc$$1, node) => doc$$1.importNode(node, true) :
      (doc$$1, node) => cloneNode(node);

    // just recycling a one-off array to use slice
    // in every needed place
    const slice = [].slice;

    // lazy evaluated, returns the unique identity
    // of a template literal, as tempalte literal itself.
    // By default, ES2015 template literals are unique
    // tag`a${1}z` === tag`a${2}z`
    // even if interpolated values are different
    // the template chunks are in a frozen Array
    // that is identical each time you use the same
    // literal to represent same static content
    // around its own interpolations.
    const unique = template => TL(template);

    // TL returns a unique version of the template
    // it needs lazy feature detection
    // (cannot trust literals with transpiled code)
    let TL = template => {
      if (
        // TypeScript template literals are not standard
        template.propertyIsEnumerable('raw') ||
        (
          // Firefox < 55 has not standard implementation neither
          /Firefox\/(\d+)/.test((G.navigator || {}).userAgent) &&
          parseFloat(RegExp.$1) < 55
        )
      ) {
        // in these cases, address templates once
        const templateObjects = {};
        // but always return the same template
        TL = template => {
          const key = '_' + template.join(UID);
          return templateObjects[key] || (
            templateObjects[key] = template
          );
        };
      }
      else {
        // make TL an identity like function
        TL = template => template;
      }
      return TL(template);
    };

    // create document fragments via native template
    // with a fallback for browsers that won't be able
    // to deal with some injected element such <td> or others
    const HTMLFragment = hasContent ?
      (node, html) => {
        const container = create(node, 'template');
        container.innerHTML = html;
        return container.content;
      } :
      (node, html) => {
        const container = create(node, 'template');
        const content = fragment(node);
        if (/^[^\S]*?<(col(?:group)?|t(?:head|body|foot|r|d|h))/i.test(html)) {
          const selector = RegExp.$1;
          container.innerHTML = '<table>' + html + '</table>';
          append(content, slice.call(container.querySelectorAll(selector)));
        } else {
          container.innerHTML = html;
          append(content, slice.call(container.childNodes));
        }
        return content;
      };

    // creates SVG fragment with a fallback for IE that needs SVG
    // within the HTML content
    const SVGFragment = hasContent ?
      (node, html) => {
        const content = fragment(node);
        const container = doc(node).createElementNS(SVG_NAMESPACE, 'svg');
        container.innerHTML = html;
        append(content, slice.call(container.childNodes));
        return content;
      } :
      (node, html) => {
        const content = fragment(node);
        const container = create(node, 'div');
        container.innerHTML = '<svg xmlns="' + SVG_NAMESPACE + '">' + html + '</svg>';
        append(content, slice.call(container.firstChild.childNodes));
        return content;
      };

    function Wire(childNodes) {
      this.childNodes = childNodes;
      this.length = childNodes.length;
      this.first = childNodes[0];
      this.last = childNodes[this.length - 1];
    }

    // when a wire is inserted, all its nodes will follow
    Wire.prototype.insert = function insert() {
      const df = fragment(this.first);
      append(df, this.childNodes);
      return df;
    };

    // when a wire is removed, all its nodes must be removed as well
    Wire.prototype.remove = function remove() {
      const first = this.first;
      const last = this.last;
      if (this.length === 2) {
        last.parentNode.removeChild(last);
      } else {
        const range = doc(first).createRange();
        range.setStartBefore(this.childNodes[1]);
        range.setEndAfter(last);
        range.deleteContents();
      }
      return first;
    };

    // every template literal interpolation indicates
    // a precise target in the DOM the template is representing.
    // `<p id=${'attribute'}>some ${'content'}</p>`
    // hyperHTML finds only once per template literal,
    // hence once per entire application life-cycle,
    // all nodes that are related to interpolations.
    // These nodes are stored as indexes used to retrieve,
    // once per upgrade, nodes that will change on each future update.
    // A path example is [2, 0, 1] representing the operation:
    // node.childNodes[2].childNodes[0].childNodes[1]
    // Attributes are addressed via their owner node and their name.
    const createPath = node => {
      const path = [];
      let parentNode;
      switch (node.nodeType) {
        case ELEMENT_NODE:
        case DOCUMENT_FRAGMENT_NODE:
          parentNode = node;
          break;
        case COMMENT_NODE:
          parentNode = node.parentNode;
          prepend(path, parentNode, node);
          break;
        default:
          parentNode = node.ownerElement;
          break;
      }
      for (
        node = parentNode;
        (parentNode = parentNode.parentNode);
        node = parentNode
      ) {
        prepend(path, parentNode, node);
      }
      return path;
    };

    const prepend = (path, parent, node) => {
      path.unshift(path.indexOf.call(parent.childNodes, node));
    };

    var Path = {
      create: (type, node, name) => ({type, name, node, path: createPath(node)}),
      find: (node, path) => {
        const length = path.length;
        for (let i = 0; i < length; i++) {
          node = node.childNodes[path[i]];
        }
        return node;
      }
    }

    // from https://github.com/developit/preact/blob/33fc697ac11762a1cb6e71e9847670d047af7ce5/src/constants.js
    const IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

    // style is handled as both string and object
    // even if the target is an SVG element (consistency)
    var Style = (node, original, isSVG) => {
      if (isSVG) {
        const style = original.cloneNode(true);
        style.value = '';
        node.setAttributeNode(style);
        return update(style, isSVG);
      }
      return update(node.style, isSVG);
    };

    // the update takes care or changing/replacing
    // only properties that are different or
    // in case of string, the whole node
    const update = (style, isSVG) => {
      let oldType, oldValue;
      return newValue => {
        switch (typeof newValue) {
          case 'object':
            if (newValue) {
              if (oldType === 'object') {
                if (!isSVG) {
                  if (oldValue !== newValue) {
                    for (const key in oldValue) {
                      if (!(key in newValue)) {
                        style[key] = '';
                      }
                    }
                  }
                }
              } else {
                if (isSVG) style.value = '';
                else style.cssText = '';
              }
              const info = isSVG ? {} : style;
              for (const key in newValue) {
                const value = newValue[key];
                info[key] = typeof value === 'number' &&
                            !IS_NON_DIMENSIONAL.test(key) ?
                              (value + 'px') : value;
              }
              oldType = 'object';
              if (isSVG) style.value = toStyle((oldValue = info));
              else oldValue = newValue;
              break;
            }
          default:
            if (oldValue != newValue) {
              oldType = 'string';
              oldValue = newValue;
              if (isSVG) style.value = newValue || '';
              else style.cssText = newValue || '';
            }
            break;
        }
      };
    };

    const hyphen = /([^A-Z])([A-Z]+)/g;
    const ized = ($0, $1, $2) => $1 + '-' + $2.toLowerCase();
    const toStyle = object => {
      const css = [];
      for (const key in object) {
        css.push(key.replace(hyphen, ized), ':', object[key], ';');
      }
      return css.join('');
    };

    /* AUTOMATICALLY IMPORTED, DO NOT MODIFY */
    /*! (c) 2017 Andrea Giammarchi (ISC) */

    /**
     * This code is a revisited port of the snabbdom vDOM diffing logic,
     * the same that fuels as fork Vue.js or other libraries.
     * @credits https://github.com/snabbdom/snabbdom
     */

    const identity = O => O;

    const remove = (parentNode, before, after) => {
      const range = parentNode.ownerDocument.createRange();
      range.setStartBefore(before);
      range.setEndAfter(after);
      range.deleteContents();
    };

    const domdiff = (
      parentNode,     // where changes happen
      currentNodes,   // Array of current items/nodes
      futureNodes,    // Array of future items/nodes
      getNode,        // optional way to retrieve a node from an item
      beforeNode      // optional item/node to use as insertBefore delimiter
    ) => {
      const get = getNode || identity;
      const before = beforeNode == null ? null : get(beforeNode, 0);
      let currentStart = 0, futureStart = 0;
      let currentEnd = currentNodes.length - 1;
      let currentStartNode = currentNodes[0];
      let currentEndNode = currentNodes[currentEnd];
      let futureEnd = futureNodes.length - 1;
      let futureStartNode = futureNodes[0];
      let futureEndNode = futureNodes[futureEnd];
      while (currentStart <= currentEnd && futureStart <= futureEnd) {
        if (currentStartNode == null) {
          currentStartNode = currentNodes[++currentStart];
        }
        else if (currentEndNode == null) {
          currentEndNode = currentNodes[--currentEnd];
        }
        else if (futureStartNode == null) {
          futureStartNode = futureNodes[++futureStart];
        }
        else if (futureEndNode == null) {
          futureEndNode = futureNodes[--futureEnd];
        }
        else if (currentStartNode == futureStartNode) {
          currentStartNode = currentNodes[++currentStart];
          futureStartNode = futureNodes[++futureStart];
        }
        else if (currentEndNode == futureEndNode) {
          currentEndNode = currentNodes[--currentEnd];
          futureEndNode = futureNodes[--futureEnd];
        }
        else if (currentStartNode == futureEndNode) {
          parentNode.insertBefore(
            get(currentStartNode, 1),
            get(currentEndNode, -0).nextSibling
          );
          currentStartNode = currentNodes[++currentStart];
          futureEndNode = futureNodes[--futureEnd];
        }
        else if (currentEndNode == futureStartNode) {
          parentNode.insertBefore(
            get(currentEndNode, 1),
            get(currentStartNode, 0)
          );
          currentEndNode = currentNodes[--currentEnd];
          futureStartNode = futureNodes[++futureStart];
        }
        else {
          let index = currentNodes.indexOf(futureStartNode);
          if (index < 0) {
            parentNode.insertBefore(
              get(futureStartNode, 1),
              get(currentStartNode, 0)
            );
            futureStartNode = futureNodes[++futureStart];
          }
          else {
            let i = index;
            let f = futureStart;
            while (
              i <= currentEnd &&
              f <= futureEnd &&
              currentNodes[i] === futureNodes[f]
            ) {
              i++;
              f++;
            }
            if (1 < (i - index)) {
              if (--index === currentStart) {
                parentNode.removeChild(get(currentStartNode, -1));
              } else {
                remove(
                  parentNode,
                  get(currentStartNode, -1),
                  get(currentNodes[index], -1)
                );
              }
              currentStart = i;
              futureStart = f;
              currentStartNode = currentNodes[i];
              futureStartNode = futureNodes[f];
            } else {
              const el = currentNodes[index];
              currentNodes[index] = null;
              parentNode.insertBefore(get(el, 1), get(currentStartNode, 0));
              futureStartNode = futureNodes[++futureStart];
            }
          }
        }
      }
      if (currentStart <= currentEnd || futureStart <= futureEnd) {
        if (currentStart > currentEnd) {
          const pin = futureNodes[futureEnd + 1];
          const place = pin == null ? before : get(pin, 0);
          if (futureStart === futureEnd) {
            parentNode.insertBefore(get(futureNodes[futureStart], 1), place);
          }
          else {
            const fragment = parentNode.ownerDocument.createDocumentFragment();
            while (futureStart <= futureEnd) {
              fragment.appendChild(get(futureNodes[futureStart++], 1));
            }
            parentNode.insertBefore(fragment, place);
          }
        }
        else {
          if (currentNodes[currentStart] == null) currentStart++;
          if (currentStart === currentEnd) {
            parentNode.removeChild(get(currentNodes[currentStart], -1));
          }
          else {
            remove(
              parentNode,
              get(currentNodes[currentStart], -1),
              get(currentNodes[currentEnd], -1)
            );
          }
        }
      }
      return futureNodes;
    };

    // hyper.Component have a connected/disconnected
    // mechanism provided by MutationObserver
    // This weak set is used to recognize components
    // as DOM node that needs to trigger connected/disconnected events
    const components = new WeakSet;

    // a basic dictionary used to filter already cached attributes
    // while looking for special hyperHTML values.
    function Cache() {}
    Cache.prototype = Object.create(null);

    // returns an intent to explicitly inject content as html
    const asHTML = html => ({html});

    // returns nodes from wires and components
    const asNode = (item, i) => {
      return 'ELEMENT_NODE' in item ?
        item :
        (item.constructor === Wire ?
          // in the Wire case, the content can be
          // removed, post-pended, inserted, or pre-pended and
          // all these cases are handled by domdiff already
          /* istanbul ignore next */
          ((1 / i) < 0 ?
            (i ? item.remove() : item.last) :
            (i ? item.insert() : item.first)) :
          asNode(item.render(), i));
    };

    // returns true if domdiff can handle the value
    const canDiff = value =>  'ELEMENT_NODE' in value ||
    value instanceof Wire ||
    value instanceof Component;

    // updates are created once per context upgrade
    // within the main render function (../hyper/render.js)
    // These are an Array of callbacks to invoke passing
    // each interpolation value.
    // Updates can be related to any kind of content,
    // attributes, or special text-only cases such <style>
    // elements or <textarea>
    const create$1 = (root, paths) => {
      const updates = [];
      const length = paths.length;
      for (let i = 0; i < length; i++) {
        const info = paths[i];
        const node = Path.find(root, info.path);
        switch (info.type) {
          case 'any':
            updates.push(setAnyContent(node, []));
            break;
          case 'attr':
            updates.push(setAttribute(node, info.name, info.node));
            break;
          case 'text':
            updates.push(setTextContent(node));
            node.textContent = '';
            break;
        }
      }
      return updates;
    };

    // finding all paths is a one-off operation performed
    // when a new template literal is used.
    // The goal is to map all target nodes that will be
    // used to update content/attributes every time
    // the same template literal is used to create content.
    // The result is a list of paths related to the template
    // with all the necessary info to create updates as
    // list of callbacks that target directly affected nodes.
    const find = (node, paths, parts) => {
      const childNodes = node.childNodes;
      const length = childNodes.length;
      for (let i = 0; i < length; i++) {
        let child = childNodes[i];
        switch (child.nodeType) {
          case ELEMENT_NODE:
            findAttributes$1(child, paths, parts);
            find(child, paths, parts);
            break;
          case COMMENT_NODE:
            if (child.textContent === UID) {
              parts.shift();
              paths.push(
                // basicHTML or other non standard engines
                // might end up having comments in nodes
                // where they shouldn't, hence this check.
                SHOULD_USE_TEXT_CONTENT.test(node.nodeName) ?
                  Path.create('text', node) :
                  Path.create('any', child)
              );
            }
            break;
          case TEXT_NODE:
            // the following ignore is actually covered by browsers
            // only basicHTML ends up on previous COMMENT_NODE case
            // instead of TEXT_NODE because it knows nothing about
            // special style or textarea behavior
            /* istanbul ignore if */
            if (
              SHOULD_USE_TEXT_CONTENT.test(node.nodeName) &&
              trim.call(child.textContent) === UIDC
            ) {
              parts.shift();
              paths.push(Path.create('text', node));
            }
            break;
        }
      }
    };

    // attributes are searched via unique hyperHTML id value.
    // Despite HTML being case insensitive, hyperHTML is able
    // to recognize attributes by name in a caseSensitive way.
    // This plays well with Custom Elements definitions
    // and also with XML-like environments, without trusting
    // the resulting DOM but the template literal as the source of truth.
    // IE/Edge has a funny bug with attributes and these might be duplicated.
    // This is why there is a cache in charge of being sure no duplicated
    // attributes are ever considered in future updates.
    const findAttributes$1 = (node, paths, parts) => {
      const cache = new Cache;
      const attributes = node.attributes;
      const array = slice.call(attributes);
      const remove = [];
      const length = array.length;
      for (let i = 0; i < length; i++) {
        const attribute = array[i];
        if (attribute.value === UID) {
          const name = attribute.name;
          // the following ignore is covered by IE
          // and the IE9 double viewBox test
          /* istanbul ignore else */
          if (!(name in cache)) {
            const realName = parts.shift().replace(/^(?:|[\S\s]*?\s)(\S+?)=['"]?$/, '$1');
            cache[name] = attributes[realName] ||
                          // the following ignore is covered by browsers
                          // while basicHTML is already case-sensitive
                          /* istanbul ignore next */
                          attributes[realName.toLowerCase()];
            paths.push(Path.create('attr', cache[name], realName));
          }
          remove.push(attribute);
        }
      }
      const len = remove.length;
      for (let i = 0; i < len; i++) {
        // Edge HTML bug #16878726
        const attribute = remove[i];
        if (/^id$/i.test(attribute.name))
          node.removeAttribute(attribute.name);
        // standard browsers would work just fine here
        else
          node.removeAttributeNode(remove[i]);
      }

      // This is a very specific Firefox/Safari issue
      // but since it should be a not so common pattern,
      // it's probably worth patching regardless.
      // Basically, scripts created through strings are death.
      // You need to create fresh new scripts instead.
      // TODO: is there any other node that needs such nonsense?
      const nodeName = node.nodeName;
      if (/^script$/i.test(nodeName)) {
        // this used to be like that
        // const script = createElement(node, nodeName);
        // then Edge arrived and decided that scripts created
        // through template documents aren't worth executing
        // so it became this ... hopefully it won't hurt in the wild
        const script = document.createElement(nodeName);
        for (let i = 0; i < attributes.length; i++) {
          script.setAttributeNode(attributes[i].cloneNode(true));
        }
        script.textContent = node.textContent;
        node.parentNode.replaceChild(script, node);
      }
    };

    // when a Promise is used as interpolation value
    // its result must be parsed once resolved.
    // This callback is in charge of understanding what to do
    // with a returned value once the promise is resolved.
    const invokeAtDistance = (value, callback) => {
      callback(value.placeholder);
      if ('text' in value) {
        Promise.resolve(value.text).then(String).then(callback);
      } else if ('any' in value) {
        Promise.resolve(value.any).then(callback);
      } else if ('html' in value) {
        Promise.resolve(value.html).then(asHTML).then(callback);
      } else {
        Promise.resolve(Intent.invoke(value, callback)).then(callback);
      }
    };

    // quick and dirty way to check for Promise/ish values
    const isPromise_ish = value => value != null && 'then' in value;

    // in a hyper(node)`<div>${content}</div>` case
    // everything could happen:
    //  * it's a JS primitive, stored as text
    //  * it's null or undefined, the node should be cleaned
    //  * it's a component, update the content by rendering it
    //  * it's a promise, update the content once resolved
    //  * it's an explicit intent, perform the desired operation
    //  * it's an Array, resolve all values if Promises and/or
    //    update the node with the resulting list of content
    const setAnyContent = (node, childNodes) => {
      let fastPath = false;
      let oldValue;
      const anyContent = value => {
        switch (typeof value) {
          case 'string':
          case 'number':
          case 'boolean':
            if (fastPath) {
              if (oldValue !== value) {
                oldValue = value;
                childNodes[0].textContent = value;
              }
            } else {
              fastPath = true;
              oldValue = value;
              childNodes = domdiff(
                node.parentNode,
                childNodes,
                [text(node, value)],
                asNode,
                node
              );
            }
            break;
          case 'object':
          case 'undefined':
            if (value == null) {
              fastPath = false;
              childNodes = domdiff(
                node.parentNode,
                childNodes,
                [],
                asNode,
                node
              );
              break;
            }
          default:
            fastPath = false;
            oldValue = value;
            if (isArray(value)) {
              if (value.length === 0) {
                if (childNodes.length) {
                  childNodes = domdiff(
                    node.parentNode,
                    childNodes,
                    [],
                    asNode,
                    node
                  );
                }
              } else {
                switch (typeof value[0]) {
                  case 'string':
                  case 'number':
                  case 'boolean':
                    anyContent({html: value});
                    break;
                  case 'object':
                    if (isArray(value[0])) {
                      value = value.concat.apply([], value);
                    }
                    if (isPromise_ish(value[0])) {
                      Promise.all(value).then(anyContent);
                      break;
                    }
                  default:
                    childNodes = domdiff(
                      node.parentNode,
                      childNodes,
                      value,
                      asNode,
                      node
                    );
                    break;
                }
              }
            } else if (canDiff(value)) {
              childNodes = domdiff(
                node.parentNode,
                childNodes,
                value.nodeType === DOCUMENT_FRAGMENT_NODE ?
                  slice.call(value.childNodes) :
                  [value],
                asNode,
                node
              );
            } else if (isPromise_ish(value)) {
              value.then(anyContent);
            } else if ('placeholder' in value) {
              invokeAtDistance(value, anyContent);
            } else if ('text' in value) {
              anyContent(String(value.text));
            } else if ('any' in value) {
              anyContent(value.any);
            } else if ('html' in value) {
              childNodes = domdiff(
                node.parentNode,
                childNodes,
                slice.call(
                  createFragment(
                    node,
                    [].concat(value.html).join('')
                  ).childNodes
                ),
                asNode,
                node
              );
            } else if ('length' in value) {
              anyContent(slice.call(value));
            } else {
              anyContent(Intent.invoke(value, anyContent));
            }
            break;
        }
      };
      return anyContent;
    };

    // there are four kind of attributes, and related behavior:
    //  * events, with a name starting with `on`, to add/remove event listeners
    //  * special, with a name present in their inherited prototype, accessed directly
    //  * regular, accessed through get/setAttribute standard DOM methods
    //  * style, the only regular attribute that also accepts an object as value
    //    so that you can style=${{width: 120}}. In this case, the behavior has been
    //    fully inspired by Preact library and its simplicity.
    const setAttribute = (node, name, original) => {
      const isSVG = OWNER_SVG_ELEMENT in node;
      let oldValue;
      // if the attribute is the style one
      // handle it differently from others
      if (name === 'style') {
        return Style(node, original, isSVG);
      }
      // the name is an event one,
      // add/remove event listeners accordingly
      else if (/^on/.test(name)) {
        let type = name.slice(2);
        if (type === CONNECTED || type === DISCONNECTED) {
          if (notObserving) {
            notObserving = false;
            observe();
          }
          components.add(node);
        }
        else if (name.toLowerCase() in node) {
          type = type.toLowerCase();
        }
        return newValue => {
          if (oldValue !== newValue) {
            if (oldValue) node.removeEventListener(type, oldValue, false);
            oldValue = newValue;
            if (newValue) node.addEventListener(type, newValue, false);
          }
        };
      }
      // the attribute is special ('value' in input)
      // and it's not SVG *or* the name is exactly data,
      // in this case assign the value directly
      else if (name === 'data' || (!isSVG && name in node)) {
        return newValue => {
          if (oldValue !== newValue) {
            oldValue = newValue;
            if (node[name] !== newValue) {
              node[name] = newValue;
              if (newValue == null) {
                node.removeAttribute(name);
              }
            }
          }
        };
      }
      // in every other case, use the attribute node as it is
      // update only the value, set it as node only when/if needed
      else {
        let owner = false;
        const attribute = original.cloneNode(true);
        return newValue => {
          if (oldValue !== newValue) {
            oldValue = newValue;
            if (attribute.value !== newValue) {
              if (newValue == null) {
                if (owner) {
                  owner = false;
                  node.removeAttributeNode(attribute);
                }
                attribute.value = newValue;
              } else {
                attribute.value = newValue;
                if (!owner) {
                  owner = true;
                  node.setAttributeNode(attribute);
                }
              }
            }
          }
        };
      }
    };

    // style or textareas don't accept HTML as content
    // it's pointless to transform or analyze anything
    // different from text there but it's worth checking
    // for possible defined intents.
    const setTextContent = node => {
      let oldValue;
      const textContent = value => {
        if (oldValue !== value) {
          oldValue = value;
          if (typeof value === 'object' && value) {
            if (isPromise_ish(value)) {
              value.then(textContent);
            } else if ('placeholder' in value) {
              invokeAtDistance(value, textContent);
            } else if ('text' in value) {
              textContent(String(value.text));
            } else if ('any' in value) {
              textContent(value.any);
            } else if ('html' in value) {
              textContent([].concat(value.html).join(''));
            } else if ('length' in value) {
              textContent(slice.call(value).join(''));
            } else {
              textContent(Intent.invoke(value, textContent));
            }
          } else {
            node.textContent = value == null ? '' : value;
          }
        }
      };
      return textContent;
    };

    var Updates = {create: create$1, find};

    // hyper.Components might need connected/disconnected notifications
    // used by components and their onconnect/ondisconnect callbacks.
    // When one of these callbacks is encountered,
    // the document starts being observed.
    let notObserving = true;
    function observe() {

      // when hyper.Component related DOM nodes
      // are appended or removed from the live tree
      // these might listen to connected/disconnected events
      // This utility is in charge of finding all components
      // involved in the DOM update/change and dispatch
      // related information to them
      const dispatchAll = (nodes, type) => {
        const event = new Event(type);
        const length = nodes.length;
        for (let i = 0; i < length; i++) {
          let node = nodes[i];
          if (node.nodeType === ELEMENT_NODE) {
            dispatchTarget(node, event);
          }
        }
      };

      // the way it's done is via the components weak set
      // and recursively looking for nested components too
      const dispatchTarget = (node, event) => {
        if (components.has(node)) {
          node.dispatchEvent(event);
        }

        const children = node.children;
        const length = children.length;
        for (let i = 0; i < length; i++) {
          dispatchTarget(children[i], event);
        }
      };

      // The MutationObserver is the best way to implement that
      // but there is a fallback to deprecated DOMNodeInserted/Removed
      // so that even older browsers/engines can help components life-cycle
      try {
        (new MutationObserver(records => {
          const length = records.length;
          for (let i = 0; i < length; i++) {
            let record = records[i];
            dispatchAll(record.removedNodes, DISCONNECTED);
            dispatchAll(record.addedNodes, CONNECTED);
          }
        })).observe(document, {subtree: true, childList: true});
      } catch(o_O) {
        document.addEventListener('DOMNodeRemoved', event => {
          dispatchAll([event.target], DISCONNECTED);
        }, false);
        document.addEventListener('DOMNodeInserted', event => {
          dispatchAll([event.target], CONNECTED);
        }, false);
      }
    }

    // a weak collection of contexts that
    // are already known to hyperHTML
    const bewitched = new WeakMap$1;

    // the collection of all template literals
    // since these are unique and immutable
    // for the whole application life-cycle
    const templates = new Map;

    // better known as hyper.bind(node), the render is
    // the main tag function in charge of fully upgrading
    // or simply updating, contexts used as hyperHTML targets.
    // The `this` context is either a regular DOM node or a fragment.
    function render(template) {
      const wicked = bewitched.get(this);
      if (wicked && wicked.template === unique(template)) {
        update$1.apply(wicked.updates, arguments);
      } else {
        upgrade.apply(this, arguments);
      }
      return this;
    }

    // an upgrade is in charge of collecting template info,
    // parse it once, if unknown, to map all interpolations
    // as single DOM callbacks, relate such template
    // to the current context, and render it after cleaning the context up
    function upgrade(template) {
      template = unique(template);
      const info =  templates.get(template) ||
                    createTemplate.call(this, template);
      const fragment = importNode(this.ownerDocument, info.fragment);
      const updates = Updates.create(fragment, info.paths);
      bewitched.set(this, {template, updates});
      update$1.apply(updates, arguments);
      this.textContent = '';
      this.appendChild(fragment);
    }

    // an update simply loops over all mapped DOM operations
    function update$1() {
      const length = arguments.length;
      for (let i = 1; i < length; i++) {
        this[i - 1](arguments[i]);
      }
    }

    // a template can be used to create a document fragment
    // aware of all interpolations and with a list
    // of paths used to find once those nodes that need updates,
    // no matter if these are attributes, text nodes, or regular one
    function createTemplate(template) {
      const paths = [];
      const html = template.join(UIDC).replace(SC_RE, SC_PLACE);
      const fragment = createFragment(this, html);
      Updates.find(fragment, paths, template.slice());
      const info = {fragment, paths};
      templates.set(template, info);
      return info;
    }

    // some node could be special though, like a custom element
    // with a self closing tag, which should work through these changes.
    const SC_RE = selfClosing;
    const SC_PLACE = ($0, $1, $2) => {
      return VOID_ELEMENTS.test($1) ? $0 : ('<' + $1 + $2 + '></' + $1 + '>');
    };

    // all wires used per each context
    const wires = new WeakMap$1;

    // A wire is a callback used as tag function
    // to lazily relate a generic object to a template literal.
    // hyper.wire(user)`<div id=user>${user.name}</div>`; => the div#user
    // This provides the ability to have a unique DOM structure
    // related to a unique JS object through a reusable template literal.
    // A wire can specify a type, as svg or html, and also an id
    // via html:id or :id convention. Such :id allows same JS objects
    // to be associated to different DOM structures accordingly with
    // the used template literal without losing previously rendered parts.
    const wire = (obj, type) => obj == null ?
      content(type || 'html') :
      weakly(obj, type || 'html');

    // A wire content is a virtual reference to one or more nodes.
    // It's represented by either a DOM node, or an Array.
    // In both cases, the wire content role is to simply update
    // all nodes through the list of related callbacks.
    // In few words, a wire content is like an invisible parent node
    // in charge of updating its content like a bound element would do.
    const content = type => {
      let wire, container, content, template, updates;
      return function (statics) {
        statics = unique(statics);
        let setup = template !== statics;
        if (setup) {
          template = statics;
          content = fragment(document);
          container = type === 'svg' ?
            document.createElementNS(SVG_NAMESPACE, 'svg') :
            content;
          updates = render.bind(container);
        }
        updates.apply(null, arguments);
        if (setup) {
          if (type === 'svg') {
            append(content, slice.call(container.childNodes));
          }
          wire = wireContent(content);
        }
        return wire;
      };
    };

    // wires are weakly created through objects.
    // Each object can have multiple wires associated
    // and this is thanks to the type + :id feature.
    const weakly = (obj, type) => {
      const i = type.indexOf(':');
      let wire = wires.get(obj);
      let id = type;
      if (-1 < i) {
        id = type.slice(i + 1);
        type = type.slice(0, i) || 'html';
      }
      if (!wire) wires.set(obj, wire = {});
      return wire[id] || (wire[id] = content(type));
    };

    // a document fragment loses its nodes as soon
    // as it's appended into another node.
    // This would easily lose wired content
    // so that on a second render call, the parent
    // node wouldn't know which node was there
    // associated to the interpolation.
    // To prevent hyperHTML to forget about wired nodes,
    // these are either returned as Array or, if there's ony one entry,
    // as single referenced node that won't disappear from the fragment.
    // The initial fragment, at this point, would be used as unique reference.
    const wireContent = node => {
      const childNodes = node.childNodes;
      const length = childNodes.length;
      const wireNodes = [];
      for (let i = 0; i < length; i++) {
        let child = childNodes[i];
        if (
          child.nodeType === ELEMENT_NODE ||
          trim.call(child.textContent).length !== 0
        ) {
          wireNodes.push(child);
        }
      }
      return wireNodes.length === 1 ? wireNodes[0] : new Wire(wireNodes);
    };

    /*! (c) Andrea Giammarchi (ISC) */

    // all functions are self bound to the right context
    // you can do the following
    // const {bind, wire} = hyperHTML;
    // and use them right away: bind(node)`hello!`;
    const bind = context => render.bind(context);

    // the wire content is the lazy defined
    // html or svg property of each hyper.Component
    setup(content);

    /** @license MIT License (c) copyright 2010-2016 original author or authors */

    // append :: a -> [a] -> [a]
    // a with x appended
    function append$1(x, a) {
      var l = a.length;
      var b = new Array(l + 1);
      for (var i = 0; i < l; ++i) {
        b[i] = a[i];
      }

      b[l] = x;
      return b;
    }

    // map :: (a -> b) -> [a] -> [b]
    // transform each element with f
    function map(f, a) {
      var l = a.length;
      var b = new Array(l);
      for (var i = 0; i < l; ++i) {
        b[i] = f(a[i]);
      }
      return b;
    }

    // reduce :: (a -> b -> a) -> a -> [b] -> a
    // accumulate via left-fold
    function reduce(f, z, a) {
      var r = z;
      for (var i = 0, l = a.length; i < l; ++i) {
        r = f(r, a[i], i);
      }
      return r;
    }

    // removeAll :: (a -> boolean) -> [a] -> [a]
    // remove all elements matching a predicate
    function removeAll(f, a) {
      var l = a.length;
      var b = new Array(l);
      var j = 0;
      for (var x, i = 0; i < l; ++i) {
        x = a[i];
        if (!f(x)) {
          b[j] = x;
          ++j;
        }
      }

      b.length = j;
      return b;
    }

    // findIndex :: a -> [a] -> Int
    // find index of x in a, from the left
    function findIndex(x, a) {
      for (var i = 0, l = a.length; i < l; ++i) {
        if (x === a[i]) {
          return i;
        }
      }
      return -1;
    }

    // curry2 :: ((a, b) -> c) -> (a -> b -> c)
    function curry2(f) {
      function curried(a, b) {
        switch (arguments.length) {
          case 0:
            return curried;
          case 1:
            return function (b) {
              return f(a, b);
            };
          default:
            return f(a, b);
        }
      }
      return curried;
    }

    // curry3 :: ((a, b, c) -> d) -> (a -> b -> c -> d)
    function curry3(f) {
      function curried(a, b, c) {
        // eslint-disable-line complexity
        switch (arguments.length) {
          case 0:
            return curried;
          case 1:
            return curry2(function (b, c) {
              return f(a, b, c);
            });
          case 2:
            return function (c) {
              return f(a, b, c);
            };
          default:
            return f(a, b, c);
        }
      }
      return curried;
    }

    var classCallCheck = function (instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    };

    var RelativeScheduler = /*#__PURE__*/function () {
      function RelativeScheduler(origin, scheduler) {
        classCallCheck(this, RelativeScheduler);

        this.origin = origin;
        this.scheduler = scheduler;
      }

      RelativeScheduler.prototype.currentTime = function currentTime() {
        return this.scheduler.currentTime() - this.origin;
      };

      RelativeScheduler.prototype.scheduleTask = function scheduleTask(localOffset, delay, period, task) {
        return this.scheduler.scheduleTask(localOffset + this.origin, delay, period, task);
      };

      RelativeScheduler.prototype.relative = function relative(origin) {
        return new RelativeScheduler(origin + this.origin, this.scheduler);
      };

      RelativeScheduler.prototype.cancel = function cancel(task) {
        return this.scheduler.cancel(task);
      };

      RelativeScheduler.prototype.cancelAll = function cancelAll(f) {
        return this.scheduler.cancelAll(f);
      };

      return RelativeScheduler;
    }();

    // Schedule a task to run as soon as possible, but
    // not in the current call stack
    var asap = /*#__PURE__*/curry2(function (task, scheduler) {
      return scheduler.scheduleTask(0, 0, -1, task);
    });

    // Schedule a task to run after a millisecond delay
    var delay = /*#__PURE__*/curry3(function (delay, task, scheduler) {
      return scheduler.scheduleTask(0, delay, -1, task);
    });

    // Cancel all ScheduledTasks for which a predicate
    // is true
    var cancelAllTasks = /*#__PURE__*/curry2(function (predicate, scheduler) {
      return scheduler.cancelAll(predicate);
    });

    var schedulerRelativeTo = /*#__PURE__*/curry2(function (offset, scheduler) {
      return new RelativeScheduler(offset, scheduler);
    });

    var classCallCheck$1 = function (instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var disposeNone = function disposeNone() {
      return NONE;
    };
    var NONE = /*#__PURE__*/new (function () {
      function DisposeNone() {
        classCallCheck$1(this, DisposeNone);
      }

      DisposeNone.prototype.dispose = function dispose() {};

      return DisposeNone;
    }())();

    var isDisposeNone = function isDisposeNone(d) {
      return d === NONE;
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    // Wrap an existing disposable (which may not already have been once()d)
    // so that it will only dispose its underlying resource at most once.
    var disposeOnce = function disposeOnce(disposable) {
      return new DisposeOnce(disposable);
    };

    var DisposeOnce = /*#__PURE__*/function () {
      function DisposeOnce(disposable) {
        classCallCheck$1(this, DisposeOnce);

        this.disposed = false;
        this.disposable = disposable;
      }

      DisposeOnce.prototype.dispose = function dispose() {
        if (!this.disposed) {
          this.disposed = true;
          this.disposable.dispose();
          this.disposable = undefined;
        }
      };

      return DisposeOnce;
    }();

    /** @license MIT License (c) copyright 2010 original author or authors */
    // Aggregate a list of disposables into a DisposeAll
    var disposeAll = function disposeAll(ds) {
      var merged = reduce(merge, [], ds);
      return merged.length === 0 ? disposeNone() : new DisposeAll(merged);
    };

    var merge = function merge(ds, d) {
      return isDisposeNone(d) ? ds : d instanceof DisposeAll ? ds.concat(d.disposables) : append$1(d, ds);
    };

    var DisposeAll = /*#__PURE__*/function () {
      function DisposeAll(disposables) {
        classCallCheck$1(this, DisposeAll);

        this.disposables = disposables;
      }

      DisposeAll.prototype.dispose = function dispose() {
        throwIfErrors(disposeCollectErrors(this.disposables));
      };

      return DisposeAll;
    }();

    // Dispose all, safely collecting errors into an array


    var disposeCollectErrors = function disposeCollectErrors(disposables) {
      return reduce(appendIfError, [], disposables);
    };

    // Call dispose and if throws, append thrown error to errors
    var appendIfError = function appendIfError(errors, d) {
      try {
        d.dispose();
      } catch (e) {
        errors.push(e);
      }
      return errors;
    };

    // Throw DisposeAllError if errors is non-empty
    var throwIfErrors = function throwIfErrors(errors) {
      if (errors.length > 0) {
        throw new DisposeAllError(errors.length + ' errors', errors);
      }
    };

    var DisposeAllError = /*#__PURE__*/function (Error) {
      function DisposeAllError(message, errors) {
        Error.call(this, message);
        this.message = message;
        this.name = DisposeAllError.name;
        this.errors = errors;

        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, DisposeAllError);
        }

        this.stack = '' + this.stack + formatErrorStacks(this.errors);
      }

      DisposeAllError.prototype = /*#__PURE__*/Object.create(Error.prototype);

      return DisposeAllError;
    }(Error);

    var formatErrorStacks = function formatErrorStacks(errors) {
      return reduce(formatErrorStack, '', errors);
    };

    var formatErrorStack = function formatErrorStack(s, e, i) {
      return s + ('\n[' + (i + 1) + '] ' + e.stack);
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */
    // Try to dispose the disposable.  If it throws, send
    // the error to sink.error with the provided Time value
    var tryDispose = /*#__PURE__*/curry3(function (t, disposable, sink) {
      try {
        disposable.dispose();
      } catch (e) {
        sink.error(t, e);
      }
    });

    /** @license MIT License (c) copyright 2010-2016 original author or authors */
    /** @author Brian Cavalier */
    /** @author John Hann */

    function fatalError(e) {
      setTimeout(rethrow, 0, e);
    }

    function rethrow(e) {
      throw e;
    }





    var classCallCheck$2 = function (instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    };











    var inherits = function (subClass, superClass) {
      if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
      }

      subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
          value: subClass,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
      if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
    };











    var possibleConstructorReturn = function (self, call) {
      if (!self) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }

      return call && (typeof call === "object" || typeof call === "function") ? call : self;
    };

    /** @license MIT License (c) copyright 2010-2016 original author or authors */
    /** @author Brian Cavalier */
    /** @author John Hann */

    var propagateTask$1 = function propagateTask(run, value, sink) {
      return new PropagateTask(run, value, sink);
    };

    var propagateEventTask$1 = function propagateEventTask(value, sink) {
      return propagateTask$1(runEvent, value, sink);
    };

    var propagateEndTask = function propagateEndTask(sink) {
      return propagateTask$1(runEnd, undefined, sink);
    };

    var PropagateTask = /*#__PURE__*/function () {
      function PropagateTask(run, value, sink) {
        classCallCheck$2(this, PropagateTask);

        this._run = run;
        this.value = value;
        this.sink = sink;
        this.active = true;
      }

      PropagateTask.prototype.dispose = function dispose$$1() {
        this.active = false;
      };

      PropagateTask.prototype.run = function run(t) {
        if (!this.active) {
          return;
        }
        var run = this._run;
        run(t, this.value, this.sink);
      };

      PropagateTask.prototype.error = function error(t, e) {
        // TODO: Remove this check and just do this.sink.error(t, e)?
        if (!this.active) {
          return fatalError(e);
        }
        this.sink.error(t, e);
      };

      return PropagateTask;
    }();

    var runEvent = function runEvent(t, x, sink) {
      return sink.event(t, x);
    };

    var runEnd = function runEnd(t, _, sink) {
      return sink.end(t);
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var empty = function empty() {
      return EMPTY;
    };

    var isCanonicalEmpty = function isCanonicalEmpty(stream) {
      return stream === EMPTY;
    };

    var Empty = /*#__PURE__*/function () {
      function Empty() {
        classCallCheck$2(this, Empty);
      }

      Empty.prototype.run = function run(sink, scheduler$$1) {
        return asap(propagateEndTask(sink), scheduler$$1);
      };

      return Empty;
    }();

    var EMPTY = /*#__PURE__*/new Empty();

    var Never = /*#__PURE__*/function () {
      function Never() {
        classCallCheck$2(this, Never);
      }

      Never.prototype.run = function run() {
        return disposeNone();
      };

      return Never;
    }();

    var NEVER = /*#__PURE__*/new Never();

    /** @license MIT License (c) copyright 2010-2017 original author or authors */
    /** @author Brian Cavalier */

    var Pipe = /*#__PURE__*/function () {
      function Pipe(sink) {
        classCallCheck$2(this, Pipe);

        this.sink = sink;
      }

      Pipe.prototype.event = function event(t, x) {
        return this.sink.event(t, x);
      };

      Pipe.prototype.end = function end(t) {
        return this.sink.end(t);
      };

      Pipe.prototype.error = function error(t, e) {
        return this.sink.error(t, e);
      };

      return Pipe;
    }();

    var FilterSink = /*#__PURE__*/function (_Pipe) {
      inherits(FilterSink, _Pipe);

      function FilterSink(p, sink) {
        classCallCheck$2(this, FilterSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.p = p;
        return _this;
      }

      FilterSink.prototype.event = function event(t, x) {
        var p = this.p;
        p(x) && this.sink.event(t, x);
      };

      return FilterSink;
    }(Pipe);

    var FilterMapSink = /*#__PURE__*/function (_Pipe) {
      inherits(FilterMapSink, _Pipe);

      function FilterMapSink(p, f, sink) {
        classCallCheck$2(this, FilterMapSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.p = p;
        _this.f = f;
        return _this;
      }

      FilterMapSink.prototype.event = function event(t, x) {
        var f = this.f;
        var p = this.p;
        p(x) && this.sink.event(t, f(x));
      };

      return FilterMapSink;
    }(Pipe);

    var MapSink = /*#__PURE__*/function (_Pipe) {
      inherits(MapSink, _Pipe);

      function MapSink(f, sink) {
        classCallCheck$2(this, MapSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        return _this;
      }

      MapSink.prototype.event = function event(t, x) {
        var f = this.f;
        this.sink.event(t, f(x));
      };

      return MapSink;
    }(Pipe);

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var SettableDisposable = /*#__PURE__*/function () {
      function SettableDisposable() {
        classCallCheck$2(this, SettableDisposable);

        this.disposable = undefined;
        this.disposed = false;
      }

      SettableDisposable.prototype.setDisposable = function setDisposable(disposable$$1) {
        if (this.disposable !== void 0) {
          throw new Error('setDisposable called more than once');
        }

        this.disposable = disposable$$1;

        if (this.disposed) {
          disposable$$1.dispose();
        }
      };

      SettableDisposable.prototype.dispose = function dispose$$1() {
        if (this.disposed) {
          return;
        }

        this.disposed = true;

        if (this.disposable !== void 0) {
          this.disposable.dispose();
        }
      };

      return SettableDisposable;
    }();

    var SliceSink = /*#__PURE__*/function (_Pipe) {
      inherits(SliceSink, _Pipe);

      function SliceSink(skip, take, sink, disposable$$1) {
        classCallCheck$2(this, SliceSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.skip = skip;
        _this.take = take;
        _this.disposable = disposable$$1;
        return _this;
      }

      SliceSink.prototype.event = function event(t, x) {
        /* eslint complexity: [1, 4] */
        if (this.skip > 0) {
          this.skip -= 1;
          return;
        }

        if (this.take === 0) {
          return;
        }

        this.take -= 1;
        this.sink.event(t, x);
        if (this.take === 0) {
          this.disposable.dispose();
          this.sink.end(t);
        }
      };

      return SliceSink;
    }(Pipe);

    var TakeWhileSink = /*#__PURE__*/function (_Pipe2) {
      inherits(TakeWhileSink, _Pipe2);

      function TakeWhileSink(p, sink, disposable$$1) {
        classCallCheck$2(this, TakeWhileSink);

        var _this2 = possibleConstructorReturn(this, _Pipe2.call(this, sink));

        _this2.p = p;
        _this2.active = true;
        _this2.disposable = disposable$$1;
        return _this2;
      }

      TakeWhileSink.prototype.event = function event(t, x) {
        if (!this.active) {
          return;
        }

        var p = this.p;
        this.active = p(x);

        if (this.active) {
          this.sink.event(t, x);
        } else {
          this.disposable.dispose();
          this.sink.end(t);
        }
      };

      return TakeWhileSink;
    }(Pipe);

    var SkipWhileSink = /*#__PURE__*/function (_Pipe3) {
      inherits(SkipWhileSink, _Pipe3);

      function SkipWhileSink(p, sink) {
        classCallCheck$2(this, SkipWhileSink);

        var _this3 = possibleConstructorReturn(this, _Pipe3.call(this, sink));

        _this3.p = p;
        _this3.skipping = true;
        return _this3;
      }

      SkipWhileSink.prototype.event = function event(t, x) {
        if (this.skipping) {
          var p = this.p;
          this.skipping = p(x);
          if (this.skipping) {
            return;
          }
        }

        this.sink.event(t, x);
      };

      return SkipWhileSink;
    }(Pipe);

    var SkipAfterSink = /*#__PURE__*/function (_Pipe4) {
      inherits(SkipAfterSink, _Pipe4);

      function SkipAfterSink(p, sink) {
        classCallCheck$2(this, SkipAfterSink);

        var _this4 = possibleConstructorReturn(this, _Pipe4.call(this, sink));

        _this4.p = p;
        _this4.skipping = false;
        return _this4;
      }

      SkipAfterSink.prototype.event = function event(t, x) {
        if (this.skipping) {
          return;
        }

        var p = this.p;
        this.skipping = p(x);
        this.sink.event(t, x);

        if (this.skipping) {
          this.sink.end(t);
        }
      };

      return SkipAfterSink;
    }(Pipe);

    var ZipItemsSink = /*#__PURE__*/function (_Pipe) {
      inherits(ZipItemsSink, _Pipe);

      function ZipItemsSink(f, items, sink) {
        classCallCheck$2(this, ZipItemsSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        _this.items = items;
        _this.index = 0;
        return _this;
      }

      ZipItemsSink.prototype.event = function event(t, b) {
        var f = this.f;
        this.sink.event(t, f(this.items[this.index], b));
        this.index += 1;
      };

      return ZipItemsSink;
    }(Pipe);

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var runEffects$1 = /*#__PURE__*/curry2(function (stream, scheduler$$1) {
      return new Promise(function (resolve, reject) {
        return runStream(stream, scheduler$$1, resolve, reject);
      });
    });

    function runStream(stream, scheduler$$1, resolve, reject) {
      var disposable$$1 = new SettableDisposable();
      var observer = new RunEffectsSink(resolve, reject, disposable$$1);

      disposable$$1.setDisposable(stream.run(observer, scheduler$$1));
    }

    var RunEffectsSink = /*#__PURE__*/function () {
      function RunEffectsSink(end, error, disposable$$1) {
        classCallCheck$2(this, RunEffectsSink);

        this._end = end;
        this._error = error;
        this._disposable = disposable$$1;
        this.active = true;
      }

      RunEffectsSink.prototype.event = function event(t, x) {};

      RunEffectsSink.prototype.end = function end(t) {
        if (!this.active) {
          return;
        }
        this._dispose(this._error, this._end, undefined);
      };

      RunEffectsSink.prototype.error = function error(t, e) {
        this._dispose(this._error, this._error, e);
      };

      RunEffectsSink.prototype._dispose = function _dispose(error, end, x) {
        this.active = false;
        tryDispose$1(error, end, x, this._disposable);
      };

      return RunEffectsSink;
    }();

    function tryDispose$1(error, end, x, disposable$$1) {
      try {
        disposable$$1.dispose();
      } catch (e) {
        error(e);
        return;
      }

      end(x);
    }

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    // Run a Stream, sending all its events to the
    // provided Sink.
    var run$1 = function run(sink, scheduler$$1, stream) {
        return stream.run(sink, scheduler$$1);
    };

    var RelativeSink = /*#__PURE__*/function () {
      function RelativeSink(offset, sink) {
        classCallCheck$2(this, RelativeSink);

        this.sink = sink;
        this.offset = offset;
      }

      RelativeSink.prototype.event = function event(t, x) {
        this.sink.event(t + this.offset, x);
      };

      RelativeSink.prototype.error = function error(t, e) {
        this.sink.error(t + this.offset, e);
      };

      RelativeSink.prototype.end = function end(t) {
        this.sink.end(t + this.offset);
      };

      return RelativeSink;
    }();

    // Create a stream with its own local clock
    // This transforms time from the provided scheduler's clock to a stream-local
    // clock (which starts at 0), and then *back* to the scheduler's clock before
    // propagating events to sink.  In other words, upstream sources will see local times,
    // and downstream sinks will see non-local (original) times.
    var withLocalTime$1 = function withLocalTime(origin, stream) {
      return new WithLocalTime(origin, stream);
    };

    var WithLocalTime = /*#__PURE__*/function () {
      function WithLocalTime(origin, source) {
        classCallCheck$2(this, WithLocalTime);

        this.origin = origin;
        this.source = source;
      }

      WithLocalTime.prototype.run = function run(sink, scheduler$$1) {
        return this.source.run(relativeSink(this.origin, sink), schedulerRelativeTo(this.origin, scheduler$$1));
      };

      return WithLocalTime;
    }();

    // Accumulate offsets instead of nesting RelativeSinks, which can happen
    // with higher-order stream and combinators like continueWith when they're
    // applied recursively.


    var relativeSink = function relativeSink(origin, sink) {
      return sink instanceof RelativeSink ? new RelativeSink(origin + sink.offset, sink.sink) : new RelativeSink(origin, sink);
    };

    var LoopSink = /*#__PURE__*/function (_Pipe) {
      inherits(LoopSink, _Pipe);

      function LoopSink(stepper, seed, sink) {
        classCallCheck$2(this, LoopSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.step = stepper;
        _this.seed = seed;
        return _this;
      }

      LoopSink.prototype.event = function event(t, x) {
        var result = this.step(this.seed, x);
        this.seed = result.seed;
        this.sink.event(t, result.value);
      };

      return LoopSink;
    }(Pipe);

    var ScanSink = /*#__PURE__*/function (_Pipe) {
      inherits(ScanSink, _Pipe);

      function ScanSink(f, z, sink) {
        classCallCheck$2(this, ScanSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        _this.value = z;
        return _this;
      }

      ScanSink.prototype.event = function event(t, x) {
        var f = this.f;
        this.value = f(this.value, x);
        this.sink.event(t, this.value);
      };

      return ScanSink;
    }(Pipe);

    var ContinueWithSink = /*#__PURE__*/function (_Pipe) {
      inherits(ContinueWithSink, _Pipe);

      function ContinueWithSink(f, source, sink, scheduler$$1) {
        classCallCheck$2(this, ContinueWithSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        _this.scheduler = scheduler$$1;
        _this.active = true;
        _this.disposable = disposeOnce(source.run(_this, scheduler$$1));
        return _this;
      }

      ContinueWithSink.prototype.event = function event(t, x) {
        if (!this.active) {
          return;
        }
        this.sink.event(t, x);
      };

      ContinueWithSink.prototype.end = function end(t) {
        if (!this.active) {
          return;
        }

        tryDispose(t, this.disposable, this.sink);

        this._startNext(t, this.sink);
      };

      ContinueWithSink.prototype._startNext = function _startNext(t, sink) {
        try {
          this.disposable = this._continue(this.f, t, sink);
        } catch (e) {
          sink.error(t, e);
        }
      };

      ContinueWithSink.prototype._continue = function _continue(f, t, sink) {
        return run$1(sink, this.scheduler, withLocalTime$1(t, f()));
      };

      ContinueWithSink.prototype.dispose = function dispose$$1() {
        this.active = false;
        return this.disposable.dispose();
      };

      return ContinueWithSink;
    }(Pipe);

    /**
    * Perform a side effect for each item in the stream
    * @param {function(x:*):*} f side effect to execute for each item. The
    *  return value will be discarded.
    * @param {Stream} stream stream to tap
    * @returns {Stream} new stream containing the same items as this stream
    */
    var tap$1 = function tap(f, stream) {
      return new Tap(f, stream);
    };

    var Tap = /*#__PURE__*/function () {
      function Tap(f, source) {
        classCallCheck$2(this, Tap);

        this.source = source;
        this.f = f;
      }

      Tap.prototype.run = function run(sink, scheduler$$1) {
        return this.source.run(new TapSink(this.f, sink), scheduler$$1);
      };

      return Tap;
    }();

    var TapSink = /*#__PURE__*/function (_Pipe) {
      inherits(TapSink, _Pipe);

      function TapSink(f, sink) {
        classCallCheck$2(this, TapSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        return _this;
      }

      TapSink.prototype.event = function event(t, x) {
        var f = this.f;
        f(x);
        this.sink.event(t, x);
      };

      return TapSink;
    }(Pipe);

    /** @license MIT License (c) copyright 2010-2016 original author or authors */
    /** @author Brian Cavalier */
    /** @author John Hann */

    var IndexSink = /*#__PURE__*/function (_Sink) {
      inherits(IndexSink, _Sink);

      function IndexSink(i, sink) {
        classCallCheck$2(this, IndexSink);

        var _this = possibleConstructorReturn(this, _Sink.call(this, sink));

        _this.index = i;
        _this.active = true;
        _this.value = undefined;
        return _this;
      }

      IndexSink.prototype.event = function event(t, x) {
        if (!this.active) {
          return;
        }
        this.value = x;
        this.sink.event(t, this);
      };

      IndexSink.prototype.end = function end(t) {
        if (!this.active) {
          return;
        }
        this.active = false;
        this.sink.event(t, this);
      };

      return IndexSink;
    }(Pipe);

    /** @license MIT License (c) copyright 2010-2016 original author or authors */
    /** @author Brian Cavalier */
    /** @author John Hann */

    function invoke(f, args) {
      /* eslint complexity: [2,7] */
      switch (args.length) {
        case 0:
          return f();
        case 1:
          return f(args[0]);
        case 2:
          return f(args[0], args[1]);
        case 3:
          return f(args[0], args[1], args[2]);
        case 4:
          return f(args[0], args[1], args[2], args[3]);
        case 5:
          return f(args[0], args[1], args[2], args[3], args[4]);
        default:
          return f.apply(void 0, args);
      }
    }

    var CombineSink = /*#__PURE__*/function (_Pipe) {
      inherits(CombineSink, _Pipe);

      function CombineSink(disposables, sinks, sink, f) {
        classCallCheck$2(this, CombineSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.disposables = disposables;
        _this.sinks = sinks;
        _this.f = f;

        var l = sinks.length;
        _this.awaiting = l;
        _this.values = new Array(l);
        _this.hasValue = new Array(l).fill(false);
        _this.activeCount = sinks.length;
        return _this;
      }

      CombineSink.prototype.event = function event(t, indexedValue) {
        if (!indexedValue.active) {
          this._dispose(t, indexedValue.index);
          return;
        }

        var i = indexedValue.index;
        var awaiting = this._updateReady(i);

        this.values[i] = indexedValue.value;
        if (awaiting === 0) {
          this.sink.event(t, invoke(this.f, this.values));
        }
      };

      CombineSink.prototype._updateReady = function _updateReady(index) {
        if (this.awaiting > 0) {
          if (!this.hasValue[index]) {
            this.hasValue[index] = true;
            this.awaiting -= 1;
          }
        }
        return this.awaiting;
      };

      CombineSink.prototype._dispose = function _dispose(t, index) {
        tryDispose(t, this.disposables[index], this.sink);
        if (--this.activeCount === 0) {
          this.sink.end(t);
        }
      };

      return CombineSink;
    }(Pipe);

    /** @license MIT License (c) copyright 2010-2016 original author or authors */
    /** @author Brian Cavalier */
    /** @author John Hann */

    /**
     * @returns {Stream} stream containing events from two streams in time order.
     * If two events are simultaneous they will be merged in arbitrary order.
     */
    function merge$1(stream1, stream2) {
      return mergeArray([stream1, stream2]);
    }

    /**
     * @param {Array} streams array of stream to merge
     * @returns {Stream} stream containing events from all input observables
     * in time order.  If two events are simultaneous they will be merged in
     * arbitrary order.
     */
    var mergeArray = function mergeArray(streams) {
      return mergeStreams(withoutCanonicalEmpty(streams));
    };

    /**
     * This implements fusion/flattening for merge.  It will
     * fuse adjacent merge operations.  For example:
     * - a.merge(b).merge(c) effectively becomes merge(a, b, c)
     * - merge(a, merge(b, c)) effectively becomes merge(a, b, c)
     * It does this by concatenating the sources arrays of
     * any nested Merge sources, in effect "flattening" nested
     * merge operations into a single merge.
     */
    var mergeStreams = function mergeStreams(streams) {
      return streams.length === 0 ? empty() : streams.length === 1 ? streams[0] : new Merge(reduce(appendSources, [], streams));
    };

    var withoutCanonicalEmpty = function withoutCanonicalEmpty(streams) {
      return streams.filter(isNotCanonicalEmpty);
    };

    var isNotCanonicalEmpty = function isNotCanonicalEmpty(stream) {
      return !isCanonicalEmpty(stream);
    };

    var appendSources = function appendSources(sources, stream) {
      return sources.concat(stream instanceof Merge ? stream.sources : stream);
    };

    var Merge = /*#__PURE__*/function () {
      function Merge(sources) {
        classCallCheck$2(this, Merge);

        this.sources = sources;
      }

      Merge.prototype.run = function run(sink, scheduler$$1) {
        var l = this.sources.length;
        var disposables = new Array(l);
        var sinks = new Array(l);

        var mergeSink = new MergeSink(disposables, sinks, sink);

        for (var indexSink, i = 0; i < l; ++i) {
          indexSink = sinks[i] = new IndexSink(i, mergeSink);
          disposables[i] = this.sources[i].run(indexSink, scheduler$$1);
        }

        return disposeAll(disposables);
      };

      return Merge;
    }();

    var MergeSink = /*#__PURE__*/function (_Pipe) {
      inherits(MergeSink, _Pipe);

      function MergeSink(disposables, sinks, sink) {
        classCallCheck$2(this, MergeSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.disposables = disposables;
        _this.activeCount = sinks.length;
        return _this;
      }

      MergeSink.prototype.event = function event(t, indexValue) {
        if (!indexValue.active) {
          this._dispose(t, indexValue.index);
          return;
        }
        this.sink.event(t, indexValue.value);
      };

      MergeSink.prototype._dispose = function _dispose(t, index) {
        tryDispose(t, this.disposables[index], this.sink);
        if (--this.activeCount === 0) {
          this.sink.end(t);
        }
      };

      return MergeSink;
    }(Pipe);

    var SnapshotSink = /*#__PURE__*/function (_Pipe) {
      inherits(SnapshotSink, _Pipe);

      function SnapshotSink(f, sink) {
        classCallCheck$2(this, SnapshotSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        _this.latest = new LatestValueSink(_this);
        return _this;
      }

      SnapshotSink.prototype.event = function event(t, x) {
        if (this.latest.hasValue) {
          var f = this.f;
          this.sink.event(t, f(this.latest.value, x));
        }
      };

      return SnapshotSink;
    }(Pipe);

    var LatestValueSink = /*#__PURE__*/function (_Pipe2) {
      inherits(LatestValueSink, _Pipe2);

      function LatestValueSink(sink) {
        classCallCheck$2(this, LatestValueSink);

        var _this2 = possibleConstructorReturn(this, _Pipe2.call(this, sink));

        _this2.hasValue = false;
        return _this2;
      }

      LatestValueSink.prototype.event = function event(t, x) {
        this.value = x;
        this.hasValue = true;
      };

      LatestValueSink.prototype.end = function end() {};

      return LatestValueSink;
    }(Pipe);

    var ZipSink = /*#__PURE__*/function (_Pipe) {
      inherits(ZipSink, _Pipe);

      function ZipSink(f, buffers, sinks, sink) {
        classCallCheck$2(this, ZipSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.f = f;
        _this.sinks = sinks;
        _this.buffers = buffers;
        return _this;
      }

      ZipSink.prototype.event = function event(t, indexedValue) {
        /* eslint complexity: [1, 5] */
        if (!indexedValue.active) {
          this._dispose(t, indexedValue.index);
          return;
        }

        var buffers = this.buffers;
        var buffer = buffers[indexedValue.index];

        buffer.push(indexedValue.value);

        if (buffer.length() === 1) {
          if (!ready(this.buffers)) {
            return;
          }

          emitZipped(this.f, t, buffers, this.sink);

          if (ended(this.buffers, this.sinks)) {
            this.sink.end(t);
          }
        }
      };

      ZipSink.prototype._dispose = function _dispose(t, index) {
        var buffer = this.buffers[index];
        if (buffer.isEmpty()) {
          this.sink.end(t);
        }
      };

      return ZipSink;
    }(Pipe);

    var emitZipped = function emitZipped(f, t, buffers, sink) {
      return sink.event(t, invoke(f, map(head, buffers)));
    };

    var head = function head(buffer) {
      return buffer.shift();
    };

    function ended(buffers, sinks) {
      for (var i = 0, l = buffers.length; i < l; ++i) {
        if (buffers[i].isEmpty() && !sinks[i].active) {
          return true;
        }
      }
      return false;
    }

    function ready(buffers) {
      for (var i = 0, l = buffers.length; i < l; ++i) {
        if (buffers[i].isEmpty()) {
          return false;
        }
      }
      return true;
    }

    var SkipRepeatsSink = /*#__PURE__*/function (_Pipe) {
      inherits(SkipRepeatsSink, _Pipe);

      function SkipRepeatsSink(equals, sink) {
        classCallCheck$2(this, SkipRepeatsSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.equals = equals;
        _this.value = void 0;
        _this.init = true;
        return _this;
      }

      SkipRepeatsSink.prototype.event = function event(t, x) {
        if (this.init) {
          this.init = false;
          this.value = x;
          this.sink.event(t, x);
        } else if (!this.equals(this.value, x)) {
          this.value = x;
          this.sink.event(t, x);
        }
      };

      return SkipRepeatsSink;
    }(Pipe);

    var Bound = /*#__PURE__*/function (_Pipe) {
      inherits(Bound, _Pipe);

      function Bound(value, sink) {
        classCallCheck$2(this, Bound);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.value = value;
        return _this;
      }

      Bound.prototype.event = function event() {};

      Bound.prototype.end = function end() {};

      Bound.prototype.dispose = function dispose$$1() {};

      return Bound;
    }(Pipe);

    var TimeWindowSink = /*#__PURE__*/function (_Pipe2) {
      inherits(TimeWindowSink, _Pipe2);

      function TimeWindowSink(min, max, sink) {
        classCallCheck$2(this, TimeWindowSink);

        var _this2 = possibleConstructorReturn(this, _Pipe2.call(this, sink));

        _this2.min = min;
        _this2.max = max;
        return _this2;
      }

      TimeWindowSink.prototype.event = function event(t, x) {
        if (t >= this.min.value && t < this.max.value) {
          this.sink.event(t, x);
        }
      };

      return TimeWindowSink;
    }(Pipe);

    var LowerBound = /*#__PURE__*/function (_Pipe3) {
      inherits(LowerBound, _Pipe3);

      function LowerBound(signal, sink, scheduler$$1) {
        classCallCheck$2(this, LowerBound);

        var _this3 = possibleConstructorReturn(this, _Pipe3.call(this, sink));

        _this3.value = Infinity;
        _this3.disposable = signal.run(_this3, scheduler$$1);
        return _this3;
      }

      LowerBound.prototype.event = function event(t /*, x */) {
        if (t < this.value) {
          this.value = t;
        }
      };

      LowerBound.prototype.end = function end() {};

      LowerBound.prototype.dispose = function dispose$$1() {
        return this.disposable.dispose();
      };

      return LowerBound;
    }(Pipe);

    var UpperBound = /*#__PURE__*/function (_Pipe4) {
      inherits(UpperBound, _Pipe4);

      function UpperBound(signal, sink, scheduler$$1) {
        classCallCheck$2(this, UpperBound);

        var _this4 = possibleConstructorReturn(this, _Pipe4.call(this, sink));

        _this4.value = Infinity;
        _this4.disposable = signal.run(_this4, scheduler$$1);
        return _this4;
      }

      UpperBound.prototype.event = function event(t, x) {
        if (t < this.value) {
          this.value = t;
          this.sink.end(t);
        }
      };

      UpperBound.prototype.end = function end() {};

      UpperBound.prototype.dispose = function dispose$$1() {
        return this.disposable.dispose();
      };

      return UpperBound;
    }(Pipe);

    var DelaySink = /*#__PURE__*/function (_Pipe) {
      inherits(DelaySink, _Pipe);

      function DelaySink(dt, sink, scheduler$$1) {
        classCallCheck$2(this, DelaySink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.dt = dt;
        _this.scheduler = scheduler$$1;
        return _this;
      }

      DelaySink.prototype.dispose = function dispose$$1() {
        var _this2 = this;

        cancelAllTasks(function (task) {
          return task.sink === _this2.sink;
        }, this.scheduler);
      };

      DelaySink.prototype.event = function event(t, x) {
        delay(this.dt, propagateEventTask$1(x, this.sink), this.scheduler);
      };

      DelaySink.prototype.end = function end(t) {
        delay(this.dt, propagateEndTask(this.sink), this.scheduler);
      };

      return DelaySink;
    }(Pipe);

    var ThrottleSink = /*#__PURE__*/function (_Pipe) {
      inherits(ThrottleSink, _Pipe);

      function ThrottleSink(period, sink) {
        classCallCheck$2(this, ThrottleSink);

        var _this = possibleConstructorReturn(this, _Pipe.call(this, sink));

        _this.time = 0;
        _this.period = period;
        return _this;
      }

      ThrottleSink.prototype.event = function event(t, x) {
        if (t >= this.time) {
          this.time = t + this.period;
          this.sink.event(t, x);
        }
      };

      return ThrottleSink;
    }(Pipe);

    // -----------------------------------------------------------------------
    // Observing

    var runEffects$$1 = /*#__PURE__*/curry2(runEffects$1);
    var tap$$1 = /*#__PURE__*/curry2(tap$1);

    // -----------------------------------------------------------------------
    // Merging

    var merge$$1 = /*#__PURE__*/curry2(merge$1);

    // Read the current time from the provided Scheduler
    var currentTime$1 = function (scheduler) { return scheduler.currentTime(); };

    /** @license MIT License (c) copyright 2015-2016 original author or authors */
    /** @author Brian Cavalier */
    // domEvent :: (EventTarget t, Event e) => String -> t -> boolean=false -> Stream e
    var domEvent = function (event, node, capture) {
        if ( capture === void 0 ) capture = false;

        return new DomEvent(event, node, capture);
    };
    var click = function (node, capture) {
      if ( capture === void 0 ) capture = false;

      return domEvent('click', node, capture);
    };
    var mouseleave = function (node, capture) {
      if ( capture === void 0 ) capture = false;

      return domEvent('mouseleave', node, capture);
    };
    var change = function (node, capture) {
      if ( capture === void 0 ) capture = false;

      return domEvent('change', node, capture);
    };

    var hashchange = function (node, capture) {
      if ( capture === void 0 ) capture = false;

      return domEvent('hashchange', node, capture);
    };

    var DomEvent = function DomEvent (event, node, capture) {
      this.event = event;
      this.node = node;
      this.capture = capture;
    };

    DomEvent.prototype.run = function run (sink, scheduler$$1) {
        var this$1 = this;

      var send = function (e) { return tryEvent$1(currentTime$1(scheduler$$1), e, sink); };
      var dispose = function () { return this$1.node.removeEventListener(this$1.event, send, this$1.capture); };

      this.node.addEventListener(this.event, send, this.capture);

      return { dispose: dispose }
    };

    function tryEvent$1 (t, x, sink) {
      try {
        sink.event(t, x);
      } catch (e) {
        sink.error(t, e);
      }
    }

    var classCallCheck$3 = function (instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var ScheduledTask$2 = /*#__PURE__*/function () {
      function ScheduledTask(time, localOffset, period, task, scheduler) {
        classCallCheck$3(this, ScheduledTask);

        this.time = time;
        this.localOffset = localOffset;
        this.period = period;
        this.task = task;
        this.scheduler = scheduler;
        this.active = true;
      }

      ScheduledTask.prototype.run = function run() {
        return this.task.run(this.time - this.localOffset);
      };

      ScheduledTask.prototype.error = function error(e) {
        return this.task.error(this.time - this.localOffset, e);
      };

      ScheduledTask.prototype.dispose = function dispose() {
        this.scheduler.cancel(this);
        return this.task.dispose();
      };

      return ScheduledTask;
    }();

    var RelativeScheduler$2 = /*#__PURE__*/function () {
      function RelativeScheduler(origin, scheduler) {
        classCallCheck$3(this, RelativeScheduler);

        this.origin = origin;
        this.scheduler = scheduler;
      }

      RelativeScheduler.prototype.currentTime = function currentTime() {
        return this.scheduler.currentTime() - this.origin;
      };

      RelativeScheduler.prototype.scheduleTask = function scheduleTask(localOffset, delay, period, task) {
        return this.scheduler.scheduleTask(localOffset + this.origin, delay, period, task);
      };

      RelativeScheduler.prototype.relative = function relative(origin) {
        return new RelativeScheduler(origin + this.origin, this.scheduler);
      };

      RelativeScheduler.prototype.cancel = function cancel(task) {
        return this.scheduler.cancel(task);
      };

      RelativeScheduler.prototype.cancelAll = function cancelAll(f) {
        return this.scheduler.cancelAll(f);
      };

      return RelativeScheduler;
    }();

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var defer$2 = function defer(task) {
      return Promise.resolve(task).then(runTask$2);
    };

    function runTask$2(task) {
      try {
        return task.run();
      } catch (e) {
        return task.error(e);
      }
    }

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var Scheduler$2 = /*#__PURE__*/function () {
      function Scheduler(timer, timeline) {
        var _this = this;

        classCallCheck$3(this, Scheduler);

        this.timer = timer;
        this.timeline = timeline;

        this._timer = null;
        this._nextArrival = Infinity;

        this._runReadyTasksBound = function () {
          return _this._runReadyTasks(_this.currentTime());
        };
      }

      Scheduler.prototype.currentTime = function currentTime() {
        return this.timer.now();
      };

      Scheduler.prototype.scheduleTask = function scheduleTask(localOffset, delay, period, task) {
        var time = this.currentTime() + Math.max(0, delay);
        var st = new ScheduledTask$2(time, localOffset, period, task, this);

        this.timeline.add(st);
        this._scheduleNextRun();
        return st;
      };

      Scheduler.prototype.relative = function relative(offset) {
        return new RelativeScheduler$2(offset, this);
      };

      Scheduler.prototype.cancel = function cancel(task) {
        task.active = false;
        if (this.timeline.remove(task)) {
          this._reschedule();
        }
      };

      Scheduler.prototype.cancelAll = function cancelAll(f) {
        this.timeline.removeAll(f);
        this._reschedule();
      };

      Scheduler.prototype._reschedule = function _reschedule() {
        if (this.timeline.isEmpty()) {
          this._unschedule();
        } else {
          this._scheduleNextRun(this.currentTime());
        }
      };

      Scheduler.prototype._unschedule = function _unschedule() {
        this.timer.clearTimer(this._timer);
        this._timer = null;
      };

      Scheduler.prototype._scheduleNextRun = function _scheduleNextRun() {
        // eslint-disable-line complexity
        if (this.timeline.isEmpty()) {
          return;
        }

        var nextArrival = this.timeline.nextArrival();

        if (this._timer === null) {
          this._scheduleNextArrival(nextArrival);
        } else if (nextArrival < this._nextArrival) {
          this._unschedule();
          this._scheduleNextArrival(nextArrival);
        }
      };

      Scheduler.prototype._scheduleNextArrival = function _scheduleNextArrival(nextArrival) {
        this._nextArrival = nextArrival;
        var delay = Math.max(0, nextArrival - this.currentTime());
        this._timer = this.timer.setTimer(this._runReadyTasksBound, delay);
      };

      Scheduler.prototype._runReadyTasks = function _runReadyTasks() {
        this._timer = null;
        this.timeline.runTasks(this.currentTime(), runTask$2);
        this._scheduleNextRun();
      };

      return Scheduler;
    }();

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    var Timeline$2 = /*#__PURE__*/function () {
      function Timeline() {
        classCallCheck$3(this, Timeline);

        this.tasks = [];
      }

      Timeline.prototype.nextArrival = function nextArrival() {
        return this.isEmpty() ? Infinity : this.tasks[0].time;
      };

      Timeline.prototype.isEmpty = function isEmpty() {
        return this.tasks.length === 0;
      };

      Timeline.prototype.add = function add(st) {
        insertByTime$2(st, this.tasks);
      };

      Timeline.prototype.remove = function remove(st) {
        var i = binarySearch$2(getTime$2(st), this.tasks);

        if (i >= 0 && i < this.tasks.length) {
          var at = findIndex(st, this.tasks[i].events);
          if (at >= 0) {
            this.tasks[i].events.splice(at, 1);
            return true;
          }
        }

        return false;
      };

      Timeline.prototype.removeAll = function removeAll$$1(f) {
        for (var i = 0; i < this.tasks.length; ++i) {
          removeAllFrom$2(f, this.tasks[i]);
        }
      };

      Timeline.prototype.runTasks = function runTasks(t, runTask) {
        var tasks = this.tasks;
        var l = tasks.length;
        var i = 0;

        while (i < l && tasks[i].time <= t) {
          ++i;
        }

        this.tasks = tasks.slice(i);

        // Run all ready tasks
        for (var j = 0; j < i; ++j) {
          this.tasks = runReadyTasks$2(runTask, tasks[j].events, this.tasks);
        }
      };

      return Timeline;
    }();

    function runReadyTasks$2(runTask, events, tasks) {
      // eslint-disable-line complexity
      for (var i = 0; i < events.length; ++i) {
        var task = events[i];

        if (task.active) {
          runTask(task);

          // Reschedule periodic repeating tasks
          // Check active again, since a task may have canceled itself
          if (task.period >= 0 && task.active) {
            task.time = task.time + task.period;
            insertByTime$2(task, tasks);
          }
        }
      }

      return tasks;
    }

    function insertByTime$2(task, timeslots) {
      var l = timeslots.length;
      var time = getTime$2(task);

      if (l === 0) {
        timeslots.push(newTimeslot$2(time, [task]));
        return;
      }

      var i = binarySearch$2(time, timeslots);

      if (i >= l) {
        timeslots.push(newTimeslot$2(time, [task]));
      } else {
        insertAtTimeslot$2(task, timeslots, time, i);
      }
    }

    function insertAtTimeslot$2(task, timeslots, time, i) {
      var timeslot = timeslots[i];
      if (time === timeslot.time) {
        addEvent$2(task, timeslot.events, time);
      } else {
        timeslots.splice(i, 0, newTimeslot$2(time, [task]));
      }
    }

    function addEvent$2(task, events) {
      if (events.length === 0 || task.time >= events[events.length - 1].time) {
        events.push(task);
      } else {
        spliceEvent$2(task, events);
      }
    }

    function spliceEvent$2(task, events) {
      for (var j = 0; j < events.length; j++) {
        if (task.time < events[j].time) {
          events.splice(j, 0, task);
          break;
        }
      }
    }

    function getTime$2(scheduledTask) {
      return Math.floor(scheduledTask.time);
    }

    function removeAllFrom$2(f, timeslot) {
      timeslot.events = removeAll(f, timeslot.events);
    }

    function binarySearch$2(t, sortedArray) {
      // eslint-disable-line complexity
      var lo = 0;
      var hi = sortedArray.length;
      var mid = void 0,
          y = void 0;

      while (lo < hi) {
        mid = Math.floor((lo + hi) / 2);
        y = sortedArray[mid];

        if (t === y.time) {
          return mid;
        } else if (t < y.time) {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
      return hi;
    }

    var newTimeslot$2 = function newTimeslot(t, events) {
      return { time: t, events: events };
    };

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    /* global setTimeout, clearTimeout */

    var ClockTimer$2 = /*#__PURE__*/function () {
      function ClockTimer(clock) {
        classCallCheck$3(this, ClockTimer);

        this._clock = clock;
      }

      ClockTimer.prototype.now = function now() {
        return this._clock.now();
      };

      ClockTimer.prototype.setTimer = function setTimer(f, dt) {
        return dt <= 0 ? runAsap$2(f) : setTimeout(f, dt);
      };

      ClockTimer.prototype.clearTimer = function clearTimer(t) {
        return t instanceof Asap$2 ? t.cancel() : clearTimeout(t);
      };

      return ClockTimer;
    }();

    var Asap$2 = /*#__PURE__*/function () {
      function Asap(f) {
        classCallCheck$3(this, Asap);

        this.f = f;
        this.active = true;
      }

      Asap.prototype.run = function run() {
        return this.active && this.f();
      };

      Asap.prototype.error = function error(e) {
        throw e;
      };

      Asap.prototype.cancel = function cancel() {
        this.active = false;
      };

      return Asap;
    }();

    function runAsap$2(f) {
      var task = new Asap$2(f);
      defer$2(task);
      return task;
    }

    /** @license MIT License (c) copyright 2010-2017 original author or authors */

    /* global performance, process */

    var RelativeClock$2 = /*#__PURE__*/function () {
      function RelativeClock(clock, origin) {
        classCallCheck$3(this, RelativeClock);

        this.origin = origin;
        this.clock = clock;
      }

      RelativeClock.prototype.now = function now() {
        return this.clock.now() - this.origin;
      };

      return RelativeClock;
    }();

    var HRTimeClock$2 = /*#__PURE__*/function () {
      function HRTimeClock(hrtime, origin) {
        classCallCheck$3(this, HRTimeClock);

        this.origin = origin;
        this.hrtime = hrtime;
      }

      HRTimeClock.prototype.now = function now() {
        var hrt = this.hrtime(this.origin);
        return (hrt[0] * 1e9 + hrt[1]) / 1e6;
      };

      return HRTimeClock;
    }();

    var clockRelativeTo$2 = function clockRelativeTo(clock) {
      return new RelativeClock$2(clock, clock.now());
    };

    var newPerformanceClock$2 = function newPerformanceClock() {
      return clockRelativeTo$2(performance);
    };

    var newDateClock$2 = function newDateClock() {
      return clockRelativeTo$2(Date);
    };

    var newHRTimeClock$2 = function newHRTimeClock() {
      return new HRTimeClock$2(process.hrtime, process.hrtime());
    };

    var newPlatformClock$2 = function newPlatformClock() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return newPerformanceClock$2();
      } else if (typeof process !== 'undefined' && typeof process.hrtime === 'function') {
        return newHRTimeClock$2();
      }

      return newDateClock$2();
    };

    var newDefaultScheduler$2 = function newDefaultScheduler() {
      return new Scheduler$2(newDefaultTimer$2(), new Timeline$2());
    };

    var newDefaultTimer$2 = function newDefaultTimer() {
      return new ClockTimer$2(newPlatformClock$2());
    };

    /**
     * Copyright (c) 2014-present, Facebook, Inc.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */

    // Used for setting prototype methods that IE8 chokes on.
    var DELETE = 'delete';

    // Constants describing the size of trie nodes.
    var SHIFT = 5; // Resulted in best performance after ______?
    var SIZE = 1 << SHIFT;
    var MASK = SIZE - 1;

    // A consistent shared value representing "not set" which equals nothing other
    // than itself, and nothing that could be provided externally.
    var NOT_SET = {};

    // Boolean references, Rough equivalent of `bool &`.
    var CHANGE_LENGTH = { value: false };
    var DID_ALTER = { value: false };

    function MakeRef(ref) {
      ref.value = false;
      return ref;
    }

    function SetRef(ref) {
      ref && (ref.value = true);
    }

    // A function which returns a value representing an "owner" for transient writes
    // to tries. The return value will only ever equal itself, and will not equal
    // the return of any subsequent call of this function.
    function OwnerID() {}

    function ensureSize(iter) {
      if (iter.size === undefined) {
        iter.size = iter.__iterate(returnTrue);
      }
      return iter.size;
    }

    function wrapIndex(iter, index) {
      // This implements "is array index" which the ECMAString spec defines as:
      //
      //     A String property name P is an array index if and only if
      //     ToString(ToUint32(P)) is equal to P and ToUint32(P) is not equal
      //     to 2^32−1.
      //
      // http://www.ecma-international.org/ecma-262/6.0/#sec-array-exotic-objects
      if (typeof index !== 'number') {
        var uint32Index = index >>> 0; // N >>> 0 is shorthand for ToUint32
        if ('' + uint32Index !== index || uint32Index === 4294967295) {
          return NaN;
        }
        index = uint32Index;
      }
      return index < 0 ? ensureSize(iter) + index : index;
    }

    function returnTrue() {
      return true;
    }

    function wholeSlice(begin, end, size) {
      return (
        ((begin === 0 && !isNeg(begin)) ||
          (size !== undefined && begin <= -size)) &&
        (end === undefined || (size !== undefined && end >= size))
      );
    }

    function resolveBegin(begin, size) {
      return resolveIndex(begin, size, 0);
    }

    function resolveEnd(end, size) {
      return resolveIndex(end, size, size);
    }

    function resolveIndex(index, size, defaultIndex) {
      // Sanitize indices using this shorthand for ToInt32(argument)
      // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
      return index === undefined
        ? defaultIndex
        : isNeg(index)
          ? size === Infinity ? size : Math.max(0, size + index) | 0
          : size === undefined || size === index
            ? index
            : Math.min(size, index) | 0;
    }

    function isNeg(value) {
      // Account for -0 which is negative, but not less than 0.
      return value < 0 || (value === 0 && 1 / value === -Infinity);
    }

    function isImmutable(maybeImmutable) {
      return isCollection(maybeImmutable) || isRecord(maybeImmutable);
    }

    function isCollection(maybeCollection) {
      return !!(maybeCollection && maybeCollection[IS_ITERABLE_SENTINEL]);
    }

    function isKeyed(maybeKeyed) {
      return !!(maybeKeyed && maybeKeyed[IS_KEYED_SENTINEL]);
    }

    function isIndexed(maybeIndexed) {
      return !!(maybeIndexed && maybeIndexed[IS_INDEXED_SENTINEL]);
    }

    function isAssociative(maybeAssociative) {
      return isKeyed(maybeAssociative) || isIndexed(maybeAssociative);
    }

    function isOrdered(maybeOrdered) {
      return !!(maybeOrdered && maybeOrdered[IS_ORDERED_SENTINEL]);
    }

    function isRecord(maybeRecord) {
      return !!(maybeRecord && maybeRecord[IS_RECORD_SENTINEL]);
    }

    function isValueObject(maybeValue) {
      return !!(
        maybeValue &&
        typeof maybeValue.equals === 'function' &&
        typeof maybeValue.hashCode === 'function'
      );
    }

    var IS_ITERABLE_SENTINEL = '@@__IMMUTABLE_ITERABLE__@@';
    var IS_KEYED_SENTINEL = '@@__IMMUTABLE_KEYED__@@';
    var IS_INDEXED_SENTINEL = '@@__IMMUTABLE_INDEXED__@@';
    var IS_ORDERED_SENTINEL = '@@__IMMUTABLE_ORDERED__@@';
    var IS_RECORD_SENTINEL = '@@__IMMUTABLE_RECORD__@@';

    var Collection = function Collection(value) {
      return isCollection(value) ? value : Seq(value);
    };

    var KeyedCollection = (function (Collection) {
      function KeyedCollection(value) {
        return isKeyed(value) ? value : KeyedSeq(value);
      }

      if ( Collection ) KeyedCollection.__proto__ = Collection;
      KeyedCollection.prototype = Object.create( Collection && Collection.prototype );
      KeyedCollection.prototype.constructor = KeyedCollection;

      return KeyedCollection;
    }(Collection));

    var IndexedCollection = (function (Collection) {
      function IndexedCollection(value) {
        return isIndexed(value) ? value : IndexedSeq(value);
      }

      if ( Collection ) IndexedCollection.__proto__ = Collection;
      IndexedCollection.prototype = Object.create( Collection && Collection.prototype );
      IndexedCollection.prototype.constructor = IndexedCollection;

      return IndexedCollection;
    }(Collection));

    var SetCollection = (function (Collection) {
      function SetCollection(value) {
        return isCollection(value) && !isAssociative(value) ? value : SetSeq(value);
      }

      if ( Collection ) SetCollection.__proto__ = Collection;
      SetCollection.prototype = Object.create( Collection && Collection.prototype );
      SetCollection.prototype.constructor = SetCollection;

      return SetCollection;
    }(Collection));

    Collection.Keyed = KeyedCollection;
    Collection.Indexed = IndexedCollection;
    Collection.Set = SetCollection;

    var ITERATE_KEYS = 0;
    var ITERATE_VALUES = 1;
    var ITERATE_ENTRIES = 2;

    var REAL_ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
    var FAUX_ITERATOR_SYMBOL = '@@iterator';

    var ITERATOR_SYMBOL = REAL_ITERATOR_SYMBOL || FAUX_ITERATOR_SYMBOL;

    var Iterator = function Iterator(next) {
      this.next = next;
    };

    Iterator.prototype.toString = function toString () {
      return '[Iterator]';
    };

    Iterator.KEYS = ITERATE_KEYS;
    Iterator.VALUES = ITERATE_VALUES;
    Iterator.ENTRIES = ITERATE_ENTRIES;

    Iterator.prototype.inspect = Iterator.prototype.toSource = function() {
      return this.toString();
    };
    Iterator.prototype[ITERATOR_SYMBOL] = function() {
      return this;
    };

    function iteratorValue(type, k, v, iteratorResult) {
      var value = type === 0 ? k : type === 1 ? v : [k, v];
      iteratorResult
        ? (iteratorResult.value = value)
        : (iteratorResult = {
            value: value,
            done: false
          });
      return iteratorResult;
    }

    function iteratorDone() {
      return { value: undefined, done: true };
    }

    function hasIterator(maybeIterable) {
      return !!getIteratorFn(maybeIterable);
    }

    function isIterator(maybeIterator) {
      return maybeIterator && typeof maybeIterator.next === 'function';
    }

    function getIterator(iterable) {
      var iteratorFn = getIteratorFn(iterable);
      return iteratorFn && iteratorFn.call(iterable);
    }

    function getIteratorFn(iterable) {
      var iteratorFn =
        iterable &&
        ((REAL_ITERATOR_SYMBOL && iterable[REAL_ITERATOR_SYMBOL]) ||
          iterable[FAUX_ITERATOR_SYMBOL]);
      if (typeof iteratorFn === 'function') {
        return iteratorFn;
      }
    }

    var hasOwnProperty$1 = Object.prototype.hasOwnProperty;

    function isArrayLike$1(value) {
      return value && typeof value.length === 'number';
    }

    var Seq = (function (Collection$$1) {
      function Seq(value) {
        return value === null || value === undefined
          ? emptySequence()
          : isImmutable(value) ? value.toSeq() : seqFromValue(value);
      }

      if ( Collection$$1 ) Seq.__proto__ = Collection$$1;
      Seq.prototype = Object.create( Collection$$1 && Collection$$1.prototype );
      Seq.prototype.constructor = Seq;

      Seq.prototype.toSeq = function toSeq () {
        return this;
      };

      Seq.prototype.toString = function toString () {
        return this.__toString('Seq {', '}');
      };

      Seq.prototype.cacheResult = function cacheResult () {
        if (!this._cache && this.__iterateUncached) {
          this._cache = this.entrySeq().toArray();
          this.size = this._cache.length;
        }
        return this;
      };

      // abstract __iterateUncached(fn, reverse)

      Seq.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var cache = this._cache;
        if (cache) {
          var size = cache.length;
          var i = 0;
          while (i !== size) {
            var entry = cache[reverse ? size - ++i : i++];
            if (fn(entry[1], entry[0], this$1) === false) {
              break;
            }
          }
          return i;
        }
        return this.__iterateUncached(fn, reverse);
      };

      // abstract __iteratorUncached(type, reverse)

      Seq.prototype.__iterator = function __iterator (type, reverse) {
        var cache = this._cache;
        if (cache) {
          var size = cache.length;
          var i = 0;
          return new Iterator(function () {
            if (i === size) {
              return iteratorDone();
            }
            var entry = cache[reverse ? size - ++i : i++];
            return iteratorValue(type, entry[0], entry[1]);
          });
        }
        return this.__iteratorUncached(type, reverse);
      };

      return Seq;
    }(Collection));

    var KeyedSeq = (function (Seq) {
      function KeyedSeq(value) {
        return value === null || value === undefined
          ? emptySequence().toKeyedSeq()
          : isCollection(value)
            ? isKeyed(value) ? value.toSeq() : value.fromEntrySeq()
            : isRecord(value) ? value.toSeq() : keyedSeqFromValue(value);
      }

      if ( Seq ) KeyedSeq.__proto__ = Seq;
      KeyedSeq.prototype = Object.create( Seq && Seq.prototype );
      KeyedSeq.prototype.constructor = KeyedSeq;

      KeyedSeq.prototype.toKeyedSeq = function toKeyedSeq () {
        return this;
      };

      return KeyedSeq;
    }(Seq));

    var IndexedSeq = (function (Seq) {
      function IndexedSeq(value) {
        return value === null || value === undefined
          ? emptySequence()
          : isCollection(value)
            ? isKeyed(value) ? value.entrySeq() : value.toIndexedSeq()
            : isRecord(value)
              ? value.toSeq().entrySeq()
              : indexedSeqFromValue(value);
      }

      if ( Seq ) IndexedSeq.__proto__ = Seq;
      IndexedSeq.prototype = Object.create( Seq && Seq.prototype );
      IndexedSeq.prototype.constructor = IndexedSeq;

      IndexedSeq.of = function of (/*...values*/) {
        return IndexedSeq(arguments);
      };

      IndexedSeq.prototype.toIndexedSeq = function toIndexedSeq () {
        return this;
      };

      IndexedSeq.prototype.toString = function toString () {
        return this.__toString('Seq [', ']');
      };

      return IndexedSeq;
    }(Seq));

    var SetSeq = (function (Seq) {
      function SetSeq(value) {
        return (isCollection(value) && !isAssociative(value)
          ? value
          : IndexedSeq(value)
        ).toSetSeq();
      }

      if ( Seq ) SetSeq.__proto__ = Seq;
      SetSeq.prototype = Object.create( Seq && Seq.prototype );
      SetSeq.prototype.constructor = SetSeq;

      SetSeq.of = function of (/*...values*/) {
        return SetSeq(arguments);
      };

      SetSeq.prototype.toSetSeq = function toSetSeq () {
        return this;
      };

      return SetSeq;
    }(Seq));

    Seq.isSeq = isSeq;
    Seq.Keyed = KeyedSeq;
    Seq.Set = SetSeq;
    Seq.Indexed = IndexedSeq;

    var IS_SEQ_SENTINEL = '@@__IMMUTABLE_SEQ__@@';

    Seq.prototype[IS_SEQ_SENTINEL] = true;

    // #pragma Root Sequences

    var ArraySeq = (function (IndexedSeq) {
      function ArraySeq(array) {
        this._array = array;
        this.size = array.length;
      }

      if ( IndexedSeq ) ArraySeq.__proto__ = IndexedSeq;
      ArraySeq.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
      ArraySeq.prototype.constructor = ArraySeq;

      ArraySeq.prototype.get = function get (index, notSetValue) {
        return this.has(index) ? this._array[wrapIndex(this, index)] : notSetValue;
      };

      ArraySeq.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var array = this._array;
        var size = array.length;
        var i = 0;
        while (i !== size) {
          var ii = reverse ? size - ++i : i++;
          if (fn(array[ii], ii, this$1) === false) {
            break;
          }
        }
        return i;
      };

      ArraySeq.prototype.__iterator = function __iterator (type, reverse) {
        var array = this._array;
        var size = array.length;
        var i = 0;
        return new Iterator(function () {
          if (i === size) {
            return iteratorDone();
          }
          var ii = reverse ? size - ++i : i++;
          return iteratorValue(type, ii, array[ii]);
        });
      };

      return ArraySeq;
    }(IndexedSeq));

    var ObjectSeq = (function (KeyedSeq) {
      function ObjectSeq(object) {
        var keys = Object.keys(object);
        this._object = object;
        this._keys = keys;
        this.size = keys.length;
      }

      if ( KeyedSeq ) ObjectSeq.__proto__ = KeyedSeq;
      ObjectSeq.prototype = Object.create( KeyedSeq && KeyedSeq.prototype );
      ObjectSeq.prototype.constructor = ObjectSeq;

      ObjectSeq.prototype.get = function get (key, notSetValue) {
        if (notSetValue !== undefined && !this.has(key)) {
          return notSetValue;
        }
        return this._object[key];
      };

      ObjectSeq.prototype.has = function has (key) {
        return hasOwnProperty$1.call(this._object, key);
      };

      ObjectSeq.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var object = this._object;
        var keys = this._keys;
        var size = keys.length;
        var i = 0;
        while (i !== size) {
          var key = keys[reverse ? size - ++i : i++];
          if (fn(object[key], key, this$1) === false) {
            break;
          }
        }
        return i;
      };

      ObjectSeq.prototype.__iterator = function __iterator (type, reverse) {
        var object = this._object;
        var keys = this._keys;
        var size = keys.length;
        var i = 0;
        return new Iterator(function () {
          if (i === size) {
            return iteratorDone();
          }
          var key = keys[reverse ? size - ++i : i++];
          return iteratorValue(type, key, object[key]);
        });
      };

      return ObjectSeq;
    }(KeyedSeq));
    ObjectSeq.prototype[IS_ORDERED_SENTINEL] = true;

    var CollectionSeq = (function (IndexedSeq) {
      function CollectionSeq(collection) {
        this._collection = collection;
        this.size = collection.length || collection.size;
      }

      if ( IndexedSeq ) CollectionSeq.__proto__ = IndexedSeq;
      CollectionSeq.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
      CollectionSeq.prototype.constructor = CollectionSeq;

      CollectionSeq.prototype.__iterateUncached = function __iterateUncached (fn, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var collection = this._collection;
        var iterator = getIterator(collection);
        var iterations = 0;
        if (isIterator(iterator)) {
          var step;
          while (!(step = iterator.next()).done) {
            if (fn(step.value, iterations++, this$1) === false) {
              break;
            }
          }
        }
        return iterations;
      };

      CollectionSeq.prototype.__iteratorUncached = function __iteratorUncached (type, reverse) {
        if (reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        var collection = this._collection;
        var iterator = getIterator(collection);
        if (!isIterator(iterator)) {
          return new Iterator(iteratorDone);
        }
        var iterations = 0;
        return new Iterator(function () {
          var step = iterator.next();
          return step.done ? step : iteratorValue(type, iterations++, step.value);
        });
      };

      return CollectionSeq;
    }(IndexedSeq));

    var IteratorSeq = (function (IndexedSeq) {
      function IteratorSeq(iterator) {
        this._iterator = iterator;
        this._iteratorCache = [];
      }

      if ( IndexedSeq ) IteratorSeq.__proto__ = IndexedSeq;
      IteratorSeq.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
      IteratorSeq.prototype.constructor = IteratorSeq;

      IteratorSeq.prototype.__iterateUncached = function __iterateUncached (fn, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var iterator = this._iterator;
        var cache = this._iteratorCache;
        var iterations = 0;
        while (iterations < cache.length) {
          if (fn(cache[iterations], iterations++, this$1) === false) {
            return iterations;
          }
        }
        var step;
        while (!(step = iterator.next()).done) {
          var val = step.value;
          cache[iterations] = val;
          if (fn(val, iterations++, this$1) === false) {
            break;
          }
        }
        return iterations;
      };

      IteratorSeq.prototype.__iteratorUncached = function __iteratorUncached (type, reverse) {
        if (reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        var iterator = this._iterator;
        var cache = this._iteratorCache;
        var iterations = 0;
        return new Iterator(function () {
          if (iterations >= cache.length) {
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            cache[iterations] = step.value;
          }
          return iteratorValue(type, iterations, cache[iterations++]);
        });
      };

      return IteratorSeq;
    }(IndexedSeq));

    // # pragma Helper functions

    function isSeq(maybeSeq) {
      return !!(maybeSeq && maybeSeq[IS_SEQ_SENTINEL]);
    }

    var EMPTY_SEQ;

    function emptySequence() {
      return EMPTY_SEQ || (EMPTY_SEQ = new ArraySeq([]));
    }

    function keyedSeqFromValue(value) {
      var seq = Array.isArray(value)
        ? new ArraySeq(value)
        : isIterator(value)
          ? new IteratorSeq(value)
          : hasIterator(value) ? new CollectionSeq(value) : undefined;
      if (seq) {
        return seq.fromEntrySeq();
      }
      if (typeof value === 'object') {
        return new ObjectSeq(value);
      }
      throw new TypeError(
        'Expected Array or collection object of [k, v] entries, or keyed object: ' +
          value
      );
    }

    function indexedSeqFromValue(value) {
      var seq = maybeIndexedSeqFromValue(value);
      if (seq) {
        return seq;
      }
      throw new TypeError(
        'Expected Array or collection object of values: ' + value
      );
    }

    function seqFromValue(value) {
      var seq = maybeIndexedSeqFromValue(value);
      if (seq) {
        return seq;
      }
      if (typeof value === 'object') {
        return new ObjectSeq(value);
      }
      throw new TypeError(
        'Expected Array or collection object of values, or keyed object: ' + value
      );
    }

    function maybeIndexedSeqFromValue(value) {
      return isArrayLike$1(value)
        ? new ArraySeq(value)
        : isIterator(value)
          ? new IteratorSeq(value)
          : hasIterator(value) ? new CollectionSeq(value) : undefined;
    }

    /**
     * An extension of the "same-value" algorithm as [described for use by ES6 Map
     * and Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#Key_equality)
     *
     * NaN is considered the same as NaN, however -0 and 0 are considered the same
     * value, which is different from the algorithm described by
     * [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is).
     *
     * This is extended further to allow Objects to describe the values they
     * represent, by way of `valueOf` or `equals` (and `hashCode`).
     *
     * Note: because of this extension, the key equality of Immutable.Map and the
     * value equality of Immutable.Set will differ from ES6 Map and Set.
     *
     * ### Defining custom values
     *
     * The easiest way to describe the value an object represents is by implementing
     * `valueOf`. For example, `Date` represents a value by returning a unix
     * timestamp for `valueOf`:
     *
     *     var date1 = new Date(1234567890000); // Fri Feb 13 2009 ...
     *     var date2 = new Date(1234567890000);
     *     date1.valueOf(); // 1234567890000
     *     assert( date1 !== date2 );
     *     assert( Immutable.is( date1, date2 ) );
     *
     * Note: overriding `valueOf` may have other implications if you use this object
     * where JavaScript expects a primitive, such as implicit string coercion.
     *
     * For more complex types, especially collections, implementing `valueOf` may
     * not be performant. An alternative is to implement `equals` and `hashCode`.
     *
     * `equals` takes another object, presumably of similar type, and returns true
     * if it is equal. Equality is symmetrical, so the same result should be
     * returned if this and the argument are flipped.
     *
     *     assert( a.equals(b) === b.equals(a) );
     *
     * `hashCode` returns a 32bit integer number representing the object which will
     * be used to determine how to store the value object in a Map or Set. You must
     * provide both or neither methods, one must not exist without the other.
     *
     * Also, an important relationship between these methods must be upheld: if two
     * values are equal, they *must* return the same hashCode. If the values are not
     * equal, they might have the same hashCode; this is called a hash collision,
     * and while undesirable for performance reasons, it is acceptable.
     *
     *     if (a.equals(b)) {
     *       assert( a.hashCode() === b.hashCode() );
     *     }
     *
     * All Immutable collections are Value Objects: they implement `equals()`
     * and `hashCode()`.
     */
    function is(valueA, valueB) {
      if (valueA === valueB || (valueA !== valueA && valueB !== valueB)) {
        return true;
      }
      if (!valueA || !valueB) {
        return false;
      }
      if (
        typeof valueA.valueOf === 'function' &&
        typeof valueB.valueOf === 'function'
      ) {
        valueA = valueA.valueOf();
        valueB = valueB.valueOf();
        if (valueA === valueB || (valueA !== valueA && valueB !== valueB)) {
          return true;
        }
        if (!valueA || !valueB) {
          return false;
        }
      }
      return !!(
        isValueObject(valueA) &&
        isValueObject(valueB) &&
        valueA.equals(valueB)
      );
    }

    var imul =
      typeof Math.imul === 'function' && Math.imul(0xffffffff, 2) === -2
        ? Math.imul
        : function imul(a, b) {
            a |= 0; // int
            b |= 0; // int
            var c = a & 0xffff;
            var d = b & 0xffff;
            // Shift by 0 fixes the sign on the high part.
            return (c * d + ((((a >>> 16) * d + c * (b >>> 16)) << 16) >>> 0)) | 0; // int
          };

    // v8 has an optimization for storing 31-bit signed numbers.
    // Values which have either 00 or 11 as the high order bits qualify.
    // This function drops the highest order bit in a signed number, maintaining
    // the sign bit.
    function smi(i32) {
      return ((i32 >>> 1) & 0x40000000) | (i32 & 0xbfffffff);
    }

    function hash(o) {
      if (o === false || o === null || o === undefined) {
        return 0;
      }
      if (typeof o.valueOf === 'function') {
        o = o.valueOf();
        if (o === false || o === null || o === undefined) {
          return 0;
        }
      }
      if (o === true) {
        return 1;
      }
      var type = typeof o;
      if (type === 'number') {
        if (o !== o || o === Infinity) {
          return 0;
        }
        var h = o | 0;
        if (h !== o) {
          h ^= o * 0xffffffff;
        }
        while (o > 0xffffffff) {
          o /= 0xffffffff;
          h ^= o;
        }
        return smi(h);
      }
      if (type === 'string') {
        return o.length > STRING_HASH_CACHE_MIN_STRLEN
          ? cachedHashString(o)
          : hashString(o);
      }
      if (typeof o.hashCode === 'function') {
        // Drop any high bits from accidentally long hash codes.
        return smi(o.hashCode());
      }
      if (type === 'object') {
        return hashJSObj(o);
      }
      if (typeof o.toString === 'function') {
        return hashString(o.toString());
      }
      throw new Error('Value type ' + type + ' cannot be hashed.');
    }

    function cachedHashString(string) {
      var hashed = stringHashCache[string];
      if (hashed === undefined) {
        hashed = hashString(string);
        if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
          STRING_HASH_CACHE_SIZE = 0;
          stringHashCache = {};
        }
        STRING_HASH_CACHE_SIZE++;
        stringHashCache[string] = hashed;
      }
      return hashed;
    }

    // http://jsperf.com/hashing-strings
    function hashString(string) {
      // This is the hash from JVM
      // The hash code for a string is computed as
      // s[0] * 31 ^ (n - 1) + s[1] * 31 ^ (n - 2) + ... + s[n - 1],
      // where s[i] is the ith character of the string and n is the length of
      // the string. We "mod" the result to make it between 0 (inclusive) and 2^31
      // (exclusive) by dropping high bits.
      var hashed = 0;
      for (var ii = 0; ii < string.length; ii++) {
        hashed = (31 * hashed + string.charCodeAt(ii)) | 0;
      }
      return smi(hashed);
    }

    function hashJSObj(obj) {
      var hashed;
      if (usingWeakMap) {
        hashed = weakMap.get(obj);
        if (hashed !== undefined) {
          return hashed;
        }
      }

      hashed = obj[UID_HASH_KEY];
      if (hashed !== undefined) {
        return hashed;
      }

      if (!canDefineProperty) {
        hashed = obj.propertyIsEnumerable && obj.propertyIsEnumerable[UID_HASH_KEY];
        if (hashed !== undefined) {
          return hashed;
        }

        hashed = getIENodeHash(obj);
        if (hashed !== undefined) {
          return hashed;
        }
      }

      hashed = ++objHashUID;
      if (objHashUID & 0x40000000) {
        objHashUID = 0;
      }

      if (usingWeakMap) {
        weakMap.set(obj, hashed);
      } else if (isExtensible !== undefined && isExtensible(obj) === false) {
        throw new Error('Non-extensible objects are not allowed as keys.');
      } else if (canDefineProperty) {
        Object.defineProperty(obj, UID_HASH_KEY, {
          enumerable: false,
          configurable: false,
          writable: false,
          value: hashed
        });
      } else if (
        obj.propertyIsEnumerable !== undefined &&
        obj.propertyIsEnumerable === obj.constructor.prototype.propertyIsEnumerable
      ) {
        // Since we can't define a non-enumerable property on the object
        // we'll hijack one of the less-used non-enumerable properties to
        // save our hash on it. Since this is a function it will not show up in
        // `JSON.stringify` which is what we want.
        obj.propertyIsEnumerable = function() {
          return this.constructor.prototype.propertyIsEnumerable.apply(
            this,
            arguments
          );
        };
        obj.propertyIsEnumerable[UID_HASH_KEY] = hashed;
      } else if (obj.nodeType !== undefined) {
        // At this point we couldn't get the IE `uniqueID` to use as a hash
        // and we couldn't use a non-enumerable property to exploit the
        // dontEnum bug so we simply add the `UID_HASH_KEY` on the node
        // itself.
        obj[UID_HASH_KEY] = hashed;
      } else {
        throw new Error('Unable to set a non-enumerable property on object.');
      }

      return hashed;
    }

    // Get references to ES5 object methods.
    var isExtensible = Object.isExtensible;

    // True if Object.defineProperty works as expected. IE8 fails this test.
    var canDefineProperty = (function() {
      try {
        Object.defineProperty({}, '@', {});
        return true;
      } catch (e) {
        return false;
      }
    })();

    // IE has a `uniqueID` property on DOM nodes. We can construct the hash from it
    // and avoid memory leaks from the IE cloneNode bug.
    function getIENodeHash(node) {
      if (node && node.nodeType > 0) {
        switch (node.nodeType) {
          case 1: // Element
            return node.uniqueID;
          case 9: // Document
            return node.documentElement && node.documentElement.uniqueID;
        }
      }
    }

    // If possible, use a WeakMap.
    var usingWeakMap = typeof WeakMap === 'function';
    var weakMap;
    if (usingWeakMap) {
      weakMap = new WeakMap();
    }

    var objHashUID = 0;

    var UID_HASH_KEY = '__immutablehash__';
    if (typeof Symbol === 'function') {
      UID_HASH_KEY = Symbol(UID_HASH_KEY);
    }

    var STRING_HASH_CACHE_MIN_STRLEN = 16;
    var STRING_HASH_CACHE_MAX_SIZE = 255;
    var STRING_HASH_CACHE_SIZE = 0;
    var stringHashCache = {};

    var ToKeyedSequence = (function (KeyedSeq$$1) {
      function ToKeyedSequence(indexed, useKeys) {
        this._iter = indexed;
        this._useKeys = useKeys;
        this.size = indexed.size;
      }

      if ( KeyedSeq$$1 ) ToKeyedSequence.__proto__ = KeyedSeq$$1;
      ToKeyedSequence.prototype = Object.create( KeyedSeq$$1 && KeyedSeq$$1.prototype );
      ToKeyedSequence.prototype.constructor = ToKeyedSequence;

      ToKeyedSequence.prototype.get = function get (key, notSetValue) {
        return this._iter.get(key, notSetValue);
      };

      ToKeyedSequence.prototype.has = function has (key) {
        return this._iter.has(key);
      };

      ToKeyedSequence.prototype.valueSeq = function valueSeq () {
        return this._iter.valueSeq();
      };

      ToKeyedSequence.prototype.reverse = function reverse () {
        var this$1 = this;

        var reversedSequence = reverseFactory(this, true);
        if (!this._useKeys) {
          reversedSequence.valueSeq = function () { return this$1._iter.toSeq().reverse(); };
        }
        return reversedSequence;
      };

      ToKeyedSequence.prototype.map = function map (mapper, context) {
        var this$1 = this;

        var mappedSequence = mapFactory(this, mapper, context);
        if (!this._useKeys) {
          mappedSequence.valueSeq = function () { return this$1._iter.toSeq().map(mapper, context); };
        }
        return mappedSequence;
      };

      ToKeyedSequence.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        return this._iter.__iterate(function (v, k) { return fn(v, k, this$1); }, reverse);
      };

      ToKeyedSequence.prototype.__iterator = function __iterator (type, reverse) {
        return this._iter.__iterator(type, reverse);
      };

      return ToKeyedSequence;
    }(KeyedSeq));
    ToKeyedSequence.prototype[IS_ORDERED_SENTINEL] = true;

    var ToIndexedSequence = (function (IndexedSeq$$1) {
      function ToIndexedSequence(iter) {
        this._iter = iter;
        this.size = iter.size;
      }

      if ( IndexedSeq$$1 ) ToIndexedSequence.__proto__ = IndexedSeq$$1;
      ToIndexedSequence.prototype = Object.create( IndexedSeq$$1 && IndexedSeq$$1.prototype );
      ToIndexedSequence.prototype.constructor = ToIndexedSequence;

      ToIndexedSequence.prototype.includes = function includes (value) {
        return this._iter.includes(value);
      };

      ToIndexedSequence.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var i = 0;
        reverse && ensureSize(this);
        return this._iter.__iterate(
          function (v) { return fn(v, reverse ? this$1.size - ++i : i++, this$1); },
          reverse
        );
      };

      ToIndexedSequence.prototype.__iterator = function __iterator (type, reverse) {
        var this$1 = this;

        var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
        var i = 0;
        reverse && ensureSize(this);
        return new Iterator(function () {
          var step = iterator.next();
          return step.done
            ? step
            : iteratorValue(
                type,
                reverse ? this$1.size - ++i : i++,
                step.value,
                step
              );
        });
      };

      return ToIndexedSequence;
    }(IndexedSeq));

    var ToSetSequence = (function (SetSeq$$1) {
      function ToSetSequence(iter) {
        this._iter = iter;
        this.size = iter.size;
      }

      if ( SetSeq$$1 ) ToSetSequence.__proto__ = SetSeq$$1;
      ToSetSequence.prototype = Object.create( SetSeq$$1 && SetSeq$$1.prototype );
      ToSetSequence.prototype.constructor = ToSetSequence;

      ToSetSequence.prototype.has = function has (key) {
        return this._iter.includes(key);
      };

      ToSetSequence.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        return this._iter.__iterate(function (v) { return fn(v, v, this$1); }, reverse);
      };

      ToSetSequence.prototype.__iterator = function __iterator (type, reverse) {
        var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
        return new Iterator(function () {
          var step = iterator.next();
          return step.done
            ? step
            : iteratorValue(type, step.value, step.value, step);
        });
      };

      return ToSetSequence;
    }(SetSeq));

    var FromEntriesSequence = (function (KeyedSeq$$1) {
      function FromEntriesSequence(entries) {
        this._iter = entries;
        this.size = entries.size;
      }

      if ( KeyedSeq$$1 ) FromEntriesSequence.__proto__ = KeyedSeq$$1;
      FromEntriesSequence.prototype = Object.create( KeyedSeq$$1 && KeyedSeq$$1.prototype );
      FromEntriesSequence.prototype.constructor = FromEntriesSequence;

      FromEntriesSequence.prototype.entrySeq = function entrySeq () {
        return this._iter.toSeq();
      };

      FromEntriesSequence.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        return this._iter.__iterate(function (entry) {
          // Check if entry exists first so array access doesn't throw for holes
          // in the parent iteration.
          if (entry) {
            validateEntry(entry);
            var indexedCollection = isCollection(entry);
            return fn(
              indexedCollection ? entry.get(1) : entry[1],
              indexedCollection ? entry.get(0) : entry[0],
              this$1
            );
          }
        }, reverse);
      };

      FromEntriesSequence.prototype.__iterator = function __iterator (type, reverse) {
        var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
        return new Iterator(function () {
          while (true) {
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            var entry = step.value;
            // Check if entry exists first so array access doesn't throw for holes
            // in the parent iteration.
            if (entry) {
              validateEntry(entry);
              var indexedCollection = isCollection(entry);
              return iteratorValue(
                type,
                indexedCollection ? entry.get(0) : entry[0],
                indexedCollection ? entry.get(1) : entry[1],
                step
              );
            }
          }
        });
      };

      return FromEntriesSequence;
    }(KeyedSeq));

    ToIndexedSequence.prototype.cacheResult = ToKeyedSequence.prototype.cacheResult = ToSetSequence.prototype.cacheResult = FromEntriesSequence.prototype.cacheResult = cacheResultThrough;

    function flipFactory(collection) {
      var flipSequence = makeSequence(collection);
      flipSequence._iter = collection;
      flipSequence.size = collection.size;
      flipSequence.flip = function () { return collection; };
      flipSequence.reverse = function() {
        var reversedSequence = collection.reverse.apply(this); // super.reverse()
        reversedSequence.flip = function () { return collection.reverse(); };
        return reversedSequence;
      };
      flipSequence.has = function (key) { return collection.includes(key); };
      flipSequence.includes = function (key) { return collection.has(key); };
      flipSequence.cacheResult = cacheResultThrough;
      flipSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        return collection.__iterate(function (v, k) { return fn(k, v, this$1) !== false; }, reverse);
      };
      flipSequence.__iteratorUncached = function(type, reverse) {
        if (type === ITERATE_ENTRIES) {
          var iterator = collection.__iterator(type, reverse);
          return new Iterator(function () {
            var step = iterator.next();
            if (!step.done) {
              var k = step.value[0];
              step.value[0] = step.value[1];
              step.value[1] = k;
            }
            return step;
          });
        }
        return collection.__iterator(
          type === ITERATE_VALUES ? ITERATE_KEYS : ITERATE_VALUES,
          reverse
        );
      };
      return flipSequence;
    }

    function mapFactory(collection, mapper, context) {
      var mappedSequence = makeSequence(collection);
      mappedSequence.size = collection.size;
      mappedSequence.has = function (key) { return collection.has(key); };
      mappedSequence.get = function (key, notSetValue) {
        var v = collection.get(key, NOT_SET);
        return v === NOT_SET
          ? notSetValue
          : mapper.call(context, v, key, collection);
      };
      mappedSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        return collection.__iterate(
          function (v, k, c) { return fn(mapper.call(context, v, k, c), k, this$1) !== false; },
          reverse
        );
      };
      mappedSequence.__iteratorUncached = function(type, reverse) {
        var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
        return new Iterator(function () {
          var step = iterator.next();
          if (step.done) {
            return step;
          }
          var entry = step.value;
          var key = entry[0];
          return iteratorValue(
            type,
            key,
            mapper.call(context, entry[1], key, collection),
            step
          );
        });
      };
      return mappedSequence;
    }

    function reverseFactory(collection, useKeys) {
      var this$1 = this;

      var reversedSequence = makeSequence(collection);
      reversedSequence._iter = collection;
      reversedSequence.size = collection.size;
      reversedSequence.reverse = function () { return collection; };
      if (collection.flip) {
        reversedSequence.flip = function() {
          var flipSequence = flipFactory(collection);
          flipSequence.reverse = function () { return collection.flip(); };
          return flipSequence;
        };
      }
      reversedSequence.get = function (key, notSetValue) { return collection.get(useKeys ? key : -1 - key, notSetValue); };
      reversedSequence.has = function (key) { return collection.has(useKeys ? key : -1 - key); };
      reversedSequence.includes = function (value) { return collection.includes(value); };
      reversedSequence.cacheResult = cacheResultThrough;
      reversedSequence.__iterate = function(fn, reverse) {
        var this$1 = this;

        var i = 0;
        reverse && ensureSize(collection);
        return collection.__iterate(
          function (v, k) { return fn(v, useKeys ? k : reverse ? this$1.size - ++i : i++, this$1); },
          !reverse
        );
      };
      reversedSequence.__iterator = function (type, reverse) {
        var i = 0;
        reverse && ensureSize(collection);
        var iterator = collection.__iterator(ITERATE_ENTRIES, !reverse);
        return new Iterator(function () {
          var step = iterator.next();
          if (step.done) {
            return step;
          }
          var entry = step.value;
          return iteratorValue(
            type,
            useKeys ? entry[0] : reverse ? this$1.size - ++i : i++,
            entry[1],
            step
          );
        });
      };
      return reversedSequence;
    }

    function filterFactory(collection, predicate, context, useKeys) {
      var filterSequence = makeSequence(collection);
      if (useKeys) {
        filterSequence.has = function (key) {
          var v = collection.get(key, NOT_SET);
          return v !== NOT_SET && !!predicate.call(context, v, key, collection);
        };
        filterSequence.get = function (key, notSetValue) {
          var v = collection.get(key, NOT_SET);
          return v !== NOT_SET && predicate.call(context, v, key, collection)
            ? v
            : notSetValue;
        };
      }
      filterSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        var iterations = 0;
        collection.__iterate(function (v, k, c) {
          if (predicate.call(context, v, k, c)) {
            iterations++;
            return fn(v, useKeys ? k : iterations - 1, this$1);
          }
        }, reverse);
        return iterations;
      };
      filterSequence.__iteratorUncached = function(type, reverse) {
        var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
        var iterations = 0;
        return new Iterator(function () {
          while (true) {
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            var entry = step.value;
            var key = entry[0];
            var value = entry[1];
            if (predicate.call(context, value, key, collection)) {
              return iteratorValue(type, useKeys ? key : iterations++, value, step);
            }
          }
        });
      };
      return filterSequence;
    }

    function countByFactory(collection, grouper, context) {
      var groups = Map$2().asMutable();
      collection.__iterate(function (v, k) {
        groups.update(grouper.call(context, v, k, collection), 0, function (a) { return a + 1; });
      });
      return groups.asImmutable();
    }

    function groupByFactory(collection, grouper, context) {
      var isKeyedIter = isKeyed(collection);
      var groups = (isOrdered(collection) ? OrderedMap() : Map$2()).asMutable();
      collection.__iterate(function (v, k) {
        groups.update(
          grouper.call(context, v, k, collection),
          function (a) { return (a = a || [], a.push(isKeyedIter ? [k, v] : v), a); }
        );
      });
      var coerce = collectionClass(collection);
      return groups.map(function (arr) { return reify(collection, coerce(arr)); });
    }

    function sliceFactory(collection, begin, end, useKeys) {
      var originalSize = collection.size;

      if (wholeSlice(begin, end, originalSize)) {
        return collection;
      }

      var resolvedBegin = resolveBegin(begin, originalSize);
      var resolvedEnd = resolveEnd(end, originalSize);

      // begin or end will be NaN if they were provided as negative numbers and
      // this collection's size is unknown. In that case, cache first so there is
      // a known size and these do not resolve to NaN.
      if (resolvedBegin !== resolvedBegin || resolvedEnd !== resolvedEnd) {
        return sliceFactory(collection.toSeq().cacheResult(), begin, end, useKeys);
      }

      // Note: resolvedEnd is undefined when the original sequence's length is
      // unknown and this slice did not supply an end and should contain all
      // elements after resolvedBegin.
      // In that case, resolvedSize will be NaN and sliceSize will remain undefined.
      var resolvedSize = resolvedEnd - resolvedBegin;
      var sliceSize;
      if (resolvedSize === resolvedSize) {
        sliceSize = resolvedSize < 0 ? 0 : resolvedSize;
      }

      var sliceSeq = makeSequence(collection);

      // If collection.size is undefined, the size of the realized sliceSeq is
      // unknown at this point unless the number of items to slice is 0
      sliceSeq.size =
        sliceSize === 0 ? sliceSize : (collection.size && sliceSize) || undefined;

      if (!useKeys && isSeq(collection) && sliceSize >= 0) {
        sliceSeq.get = function(index, notSetValue) {
          index = wrapIndex(this, index);
          return index >= 0 && index < sliceSize
            ? collection.get(index + resolvedBegin, notSetValue)
            : notSetValue;
        };
      }

      sliceSeq.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        if (sliceSize === 0) {
          return 0;
        }
        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var skipped = 0;
        var isSkipping = true;
        var iterations = 0;
        collection.__iterate(function (v, k) {
          if (!(isSkipping && (isSkipping = skipped++ < resolvedBegin))) {
            iterations++;
            return (
              fn(v, useKeys ? k : iterations - 1, this$1) !== false &&
              iterations !== sliceSize
            );
          }
        });
        return iterations;
      };

      sliceSeq.__iteratorUncached = function(type, reverse) {
        if (sliceSize !== 0 && reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        // Don't bother instantiating parent iterator if taking 0.
        if (sliceSize === 0) {
          return new Iterator(iteratorDone);
        }
        var iterator = collection.__iterator(type, reverse);
        var skipped = 0;
        var iterations = 0;
        return new Iterator(function () {
          while (skipped++ < resolvedBegin) {
            iterator.next();
          }
          if (++iterations > sliceSize) {
            return iteratorDone();
          }
          var step = iterator.next();
          if (useKeys || type === ITERATE_VALUES || step.done) {
            return step;
          }
          if (type === ITERATE_KEYS) {
            return iteratorValue(type, iterations - 1, undefined, step);
          }
          return iteratorValue(type, iterations - 1, step.value[1], step);
        });
      };

      return sliceSeq;
    }

    function takeWhileFactory(collection, predicate, context) {
      var takeSequence = makeSequence(collection);
      takeSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var iterations = 0;
        collection.__iterate(
          function (v, k, c) { return predicate.call(context, v, k, c) && ++iterations && fn(v, k, this$1); }
        );
        return iterations;
      };
      takeSequence.__iteratorUncached = function(type, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
        var iterating = true;
        return new Iterator(function () {
          if (!iterating) {
            return iteratorDone();
          }
          var step = iterator.next();
          if (step.done) {
            return step;
          }
          var entry = step.value;
          var k = entry[0];
          var v = entry[1];
          if (!predicate.call(context, v, k, this$1)) {
            iterating = false;
            return iteratorDone();
          }
          return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
        });
      };
      return takeSequence;
    }

    function skipWhileFactory(collection, predicate, context, useKeys) {
      var skipSequence = makeSequence(collection);
      skipSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var isSkipping = true;
        var iterations = 0;
        collection.__iterate(function (v, k, c) {
          if (!(isSkipping && (isSkipping = predicate.call(context, v, k, c)))) {
            iterations++;
            return fn(v, useKeys ? k : iterations - 1, this$1);
          }
        });
        return iterations;
      };
      skipSequence.__iteratorUncached = function(type, reverse) {
        var this$1 = this;

        if (reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
        var skipping = true;
        var iterations = 0;
        return new Iterator(function () {
          var step;
          var k;
          var v;
          do {
            step = iterator.next();
            if (step.done) {
              if (useKeys || type === ITERATE_VALUES) {
                return step;
              }
              if (type === ITERATE_KEYS) {
                return iteratorValue(type, iterations++, undefined, step);
              }
              return iteratorValue(type, iterations++, step.value[1], step);
            }
            var entry = step.value;
            k = entry[0];
            v = entry[1];
            skipping && (skipping = predicate.call(context, v, k, this$1));
          } while (skipping);
          return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
        });
      };
      return skipSequence;
    }

    function concatFactory(collection, values) {
      var isKeyedCollection = isKeyed(collection);
      var iters = [collection]
        .concat(values)
        .map(function (v) {
          if (!isCollection(v)) {
            v = isKeyedCollection
              ? keyedSeqFromValue(v)
              : indexedSeqFromValue(Array.isArray(v) ? v : [v]);
          } else if (isKeyedCollection) {
            v = KeyedCollection(v);
          }
          return v;
        })
        .filter(function (v) { return v.size !== 0; });

      if (iters.length === 0) {
        return collection;
      }

      if (iters.length === 1) {
        var singleton = iters[0];
        if (
          singleton === collection ||
          (isKeyedCollection && isKeyed(singleton)) ||
          (isIndexed(collection) && isIndexed(singleton))
        ) {
          return singleton;
        }
      }

      var concatSeq = new ArraySeq(iters);
      if (isKeyedCollection) {
        concatSeq = concatSeq.toKeyedSeq();
      } else if (!isIndexed(collection)) {
        concatSeq = concatSeq.toSetSeq();
      }
      concatSeq = concatSeq.flatten(true);
      concatSeq.size = iters.reduce(function (sum, seq) {
        if (sum !== undefined) {
          var size = seq.size;
          if (size !== undefined) {
            return sum + size;
          }
        }
      }, 0);
      return concatSeq;
    }

    function flattenFactory(collection, depth, useKeys) {
      var flatSequence = makeSequence(collection);
      flatSequence.__iterateUncached = function(fn, reverse) {
        if (reverse) {
          return this.cacheResult().__iterate(fn, reverse);
        }
        var iterations = 0;
        var stopped = false;
        function flatDeep(iter, currentDepth) {
          iter.__iterate(function (v, k) {
            if ((!depth || currentDepth < depth) && isCollection(v)) {
              flatDeep(v, currentDepth + 1);
            } else {
              iterations++;
              if (fn(v, useKeys ? k : iterations - 1, flatSequence) === false) {
                stopped = true;
              }
            }
            return !stopped;
          }, reverse);
        }
        flatDeep(collection, 0);
        return iterations;
      };
      flatSequence.__iteratorUncached = function(type, reverse) {
        if (reverse) {
          return this.cacheResult().__iterator(type, reverse);
        }
        var iterator = collection.__iterator(type, reverse);
        var stack = [];
        var iterations = 0;
        return new Iterator(function () {
          while (iterator) {
            var step = iterator.next();
            if (step.done !== false) {
              iterator = stack.pop();
              continue;
            }
            var v = step.value;
            if (type === ITERATE_ENTRIES) {
              v = v[1];
            }
            if ((!depth || stack.length < depth) && isCollection(v)) {
              stack.push(iterator);
              iterator = v.__iterator(type, reverse);
            } else {
              return useKeys ? step : iteratorValue(type, iterations++, v, step);
            }
          }
          return iteratorDone();
        });
      };
      return flatSequence;
    }

    function flatMapFactory(collection, mapper, context) {
      var coerce = collectionClass(collection);
      return collection
        .toSeq()
        .map(function (v, k) { return coerce(mapper.call(context, v, k, collection)); })
        .flatten(true);
    }

    function interposeFactory(collection, separator) {
      var interposedSequence = makeSequence(collection);
      interposedSequence.size = collection.size && collection.size * 2 - 1;
      interposedSequence.__iterateUncached = function(fn, reverse) {
        var this$1 = this;

        var iterations = 0;
        collection.__iterate(
          function (v) { return (!iterations || fn(separator, iterations++, this$1) !== false) &&
            fn(v, iterations++, this$1) !== false; },
          reverse
        );
        return iterations;
      };
      interposedSequence.__iteratorUncached = function(type, reverse) {
        var iterator = collection.__iterator(ITERATE_VALUES, reverse);
        var iterations = 0;
        var step;
        return new Iterator(function () {
          if (!step || iterations % 2) {
            step = iterator.next();
            if (step.done) {
              return step;
            }
          }
          return iterations % 2
            ? iteratorValue(type, iterations++, separator)
            : iteratorValue(type, iterations++, step.value, step);
        });
      };
      return interposedSequence;
    }

    function sortFactory(collection, comparator, mapper) {
      if (!comparator) {
        comparator = defaultComparator;
      }
      var isKeyedCollection = isKeyed(collection);
      var index = 0;
      var entries = collection
        .toSeq()
        .map(function (v, k) { return [k, v, index++, mapper ? mapper(v, k, collection) : v]; })
        .valueSeq()
        .toArray();
      entries.sort(function (a, b) { return comparator(a[3], b[3]) || a[2] - b[2]; }).forEach(
        isKeyedCollection
          ? function (v, i) {
              entries[i].length = 2;
            }
          : function (v, i) {
              entries[i] = v[1];
            }
      );
      return isKeyedCollection
        ? KeyedSeq(entries)
        : isIndexed(collection) ? IndexedSeq(entries) : SetSeq(entries);
    }

    function maxFactory(collection, comparator, mapper) {
      if (!comparator) {
        comparator = defaultComparator;
      }
      if (mapper) {
        var entry = collection
          .toSeq()
          .map(function (v, k) { return [v, mapper(v, k, collection)]; })
          .reduce(function (a, b) { return (maxCompare(comparator, a[1], b[1]) ? b : a); });
        return entry && entry[0];
      }
      return collection.reduce(function (a, b) { return (maxCompare(comparator, a, b) ? b : a); });
    }

    function maxCompare(comparator, a, b) {
      var comp = comparator(b, a);
      // b is considered the new max if the comparator declares them equal, but
      // they are not equal and b is in fact a nullish value.
      return (
        (comp === 0 && b !== a && (b === undefined || b === null || b !== b)) ||
        comp > 0
      );
    }

    function zipWithFactory(keyIter, zipper, iters, zipAll) {
      var zipSequence = makeSequence(keyIter);
      var sizes = new ArraySeq(iters).map(function (i) { return i.size; });
      zipSequence.size = zipAll ? sizes.max() : sizes.min();
      // Note: this a generic base implementation of __iterate in terms of
      // __iterator which may be more generically useful in the future.
      zipSequence.__iterate = function(fn, reverse) {
        var this$1 = this;

        /* generic:
        var iterator = this.__iterator(ITERATE_ENTRIES, reverse);
        var step;
        var iterations = 0;
        while (!(step = iterator.next()).done) {
          iterations++;
          if (fn(step.value[1], step.value[0], this) === false) {
            break;
          }
        }
        return iterations;
        */
        // indexed:
        var iterator = this.__iterator(ITERATE_VALUES, reverse);
        var step;
        var iterations = 0;
        while (!(step = iterator.next()).done) {
          if (fn(step.value, iterations++, this$1) === false) {
            break;
          }
        }
        return iterations;
      };
      zipSequence.__iteratorUncached = function(type, reverse) {
        var iterators = iters.map(
          function (i) { return (i = Collection(i), getIterator(reverse ? i.reverse() : i)); }
        );
        var iterations = 0;
        var isDone = false;
        return new Iterator(function () {
          var steps;
          if (!isDone) {
            steps = iterators.map(function (i) { return i.next(); });
            isDone = zipAll ? steps.every(function (s) { return s.done; }) : steps.some(function (s) { return s.done; });
          }
          if (isDone) {
            return iteratorDone();
          }
          return iteratorValue(
            type,
            iterations++,
            zipper.apply(null, steps.map(function (s) { return s.value; }))
          );
        });
      };
      return zipSequence;
    }

    // #pragma Helper Functions

    function reify(iter, seq) {
      return iter === seq ? iter : isSeq(iter) ? seq : iter.constructor(seq);
    }

    function validateEntry(entry) {
      if (entry !== Object(entry)) {
        throw new TypeError('Expected [K, V] tuple: ' + entry);
      }
    }

    function collectionClass(collection) {
      return isKeyed(collection)
        ? KeyedCollection
        : isIndexed(collection) ? IndexedCollection : SetCollection;
    }

    function makeSequence(collection) {
      return Object.create(
        (isKeyed(collection)
          ? KeyedSeq
          : isIndexed(collection) ? IndexedSeq : SetSeq
        ).prototype
      );
    }

    function cacheResultThrough() {
      if (this._iter.cacheResult) {
        this._iter.cacheResult();
        this.size = this._iter.size;
        return this;
      }
      return Seq.prototype.cacheResult.call(this);
    }

    function defaultComparator(a, b) {
      if (a === undefined && b === undefined) {
        return 0;
      }

      if (a === undefined) {
        return 1;
      }

      if (b === undefined) {
        return -1;
      }

      return a > b ? 1 : a < b ? -1 : 0;
    }

    // http://jsperf.com/copy-array-inline
    function arrCopy(arr, offset) {
      offset = offset || 0;
      var len = Math.max(0, arr.length - offset);
      var newArr = new Array(len);
      for (var ii = 0; ii < len; ii++) {
        newArr[ii] = arr[ii + offset];
      }
      return newArr;
    }

    function invariant(condition, error) {
      if (!condition) { throw new Error(error); }
    }

    function assertNotInfinite(size) {
      invariant(
        size !== Infinity,
        'Cannot perform this action with an infinite size.'
      );
    }

    function coerceKeyPath(keyPath) {
      if (isArrayLike$1(keyPath) && typeof keyPath !== 'string') {
        return keyPath;
      }
      if (isOrdered(keyPath)) {
        return keyPath.toArray();
      }
      throw new TypeError(
        'Invalid keyPath: expected Ordered Collection or Array: ' + keyPath
      );
    }

    function isPlainObj(value) {
      return (
        value && (value.constructor === Object || value.constructor === undefined)
      );
    }

    /**
     * Returns true if the value is a potentially-persistent data structure, either
     * provided by Immutable.js or a plain Array or Object.
     */
    function isDataStructure(value) {
      return isImmutable(value) || Array.isArray(value) || isPlainObj(value);
    }

    /**
     * Converts a value to a string, adding quotes if a string was provided.
     */
    function quoteString(value) {
      try {
        return typeof value === 'string' ? JSON.stringify(value) : String(value);
      } catch (_ignoreError) {
        return JSON.stringify(value);
      }
    }

    function has(collection, key) {
      return isImmutable(collection)
        ? collection.has(key)
        : isDataStructure(collection) && hasOwnProperty$1.call(collection, key);
    }

    function get(collection, key, notSetValue) {
      return isImmutable(collection)
        ? collection.get(key, notSetValue)
        : !has(collection, key)
          ? notSetValue
          : typeof collection.get === 'function'
            ? collection.get(key)
            : collection[key];
    }

    function shallowCopy(from) {
      if (Array.isArray(from)) {
        return arrCopy(from);
      }
      var to = {};
      for (var key in from) {
        if (hasOwnProperty$1.call(from, key)) {
          to[key] = from[key];
        }
      }
      return to;
    }

    function remove$2(collection, key) {
      if (!isDataStructure(collection)) {
        throw new TypeError(
          'Cannot update non-data-structure value: ' + collection
        );
      }
      if (isImmutable(collection)) {
        if (!collection.remove) {
          throw new TypeError(
            'Cannot update immutable value without .remove() method: ' + collection
          );
        }
        return collection.remove(key);
      }
      if (!hasOwnProperty$1.call(collection, key)) {
        return collection;
      }
      var collectionCopy = shallowCopy(collection);
      if (Array.isArray(collectionCopy)) {
        collectionCopy.splice(key, 1);
      } else {
        delete collectionCopy[key];
      }
      return collectionCopy;
    }

    function set(collection, key, value) {
      if (!isDataStructure(collection)) {
        throw new TypeError(
          'Cannot update non-data-structure value: ' + collection
        );
      }
      if (isImmutable(collection)) {
        if (!collection.set) {
          throw new TypeError(
            'Cannot update immutable value without .set() method: ' + collection
          );
        }
        return collection.set(key, value);
      }
      if (hasOwnProperty$1.call(collection, key) && value === collection[key]) {
        return collection;
      }
      var collectionCopy = shallowCopy(collection);
      collectionCopy[key] = value;
      return collectionCopy;
    }

    function updateIn(collection, keyPath, notSetValue, updater) {
      if (!updater) {
        updater = notSetValue;
        notSetValue = undefined;
      }
      var updatedValue = updateInDeeply(
        isImmutable(collection),
        collection,
        coerceKeyPath(keyPath),
        0,
        notSetValue,
        updater
      );
      return updatedValue === NOT_SET ? notSetValue : updatedValue;
    }

    function updateInDeeply(
      inImmutable,
      existing,
      keyPath,
      i,
      notSetValue,
      updater
    ) {
      var wasNotSet = existing === NOT_SET;
      if (i === keyPath.length) {
        var existingValue = wasNotSet ? notSetValue : existing;
        var newValue = updater(existingValue);
        return newValue === existingValue ? existing : newValue;
      }
      if (!wasNotSet && !isDataStructure(existing)) {
        throw new TypeError(
          'Cannot update within non-data-structure value in path [' +
            keyPath.slice(0, i).map(quoteString) +
            ']: ' +
            existing
        );
      }
      var key = keyPath[i];
      var nextExisting = wasNotSet ? NOT_SET : get(existing, key, NOT_SET);
      var nextUpdated = updateInDeeply(
        nextExisting === NOT_SET ? inImmutable : isImmutable(nextExisting),
        nextExisting,
        keyPath,
        i + 1,
        notSetValue,
        updater
      );
      return nextUpdated === nextExisting
        ? existing
        : nextUpdated === NOT_SET
          ? remove$2(existing, key)
          : set(
              wasNotSet ? (inImmutable ? emptyMap() : {}) : existing,
              key,
              nextUpdated
            );
    }

    function setIn$1(collection, keyPath, value) {
      return updateIn(collection, keyPath, NOT_SET, function () { return value; });
    }

    function setIn$$1(keyPath, v) {
      return setIn$1(this, keyPath, v);
    }

    function removeIn(collection, keyPath) {
      return updateIn(collection, keyPath, function () { return NOT_SET; });
    }

    function deleteIn(keyPath) {
      return removeIn(this, keyPath);
    }

    function update$1$1(collection, key, notSetValue, updater) {
      return updateIn(collection, [key], notSetValue, updater);
    }

    function update$$1(key, notSetValue, updater) {
      return arguments.length === 1
        ? key(this)
        : update$1$1(this, key, notSetValue, updater);
    }

    function updateIn$1(keyPath, notSetValue, updater) {
      return updateIn(this, keyPath, notSetValue, updater);
    }

    function merge$2() {
      var iters = [], len = arguments.length;
      while ( len-- ) iters[ len ] = arguments[ len ];

      return mergeIntoKeyedWith(this, iters);
    }

    function mergeWith(merger) {
      var iters = [], len = arguments.length - 1;
      while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

      return mergeIntoKeyedWith(this, iters, merger);
    }

    function mergeIntoKeyedWith(collection, collections, merger) {
      var iters = [];
      for (var ii = 0; ii < collections.length; ii++) {
        var collection$1 = KeyedCollection(collections[ii]);
        if (collection$1.size !== 0) {
          iters.push(collection$1);
        }
      }
      if (iters.length === 0) {
        return collection;
      }
      if (collection.size === 0 && !collection.__ownerID && iters.length === 1) {
        return collection.constructor(iters[0]);
      }
      return collection.withMutations(function (collection) {
        var mergeIntoCollection = merger
          ? function (value, key) {
              update$1$1(
                collection,
                key,
                NOT_SET,
                function (oldVal) { return (oldVal === NOT_SET ? value : merger(oldVal, value, key)); }
              );
            }
          : function (value, key) {
              collection.set(key, value);
            };
        for (var ii = 0; ii < iters.length; ii++) {
          iters[ii].forEach(mergeIntoCollection);
        }
      });
    }

    function mergeDeepWithSources(collection, sources, merger) {
      return mergeWithSources(collection, sources, deepMergerWith(merger));
    }

    function mergeWithSources(collection, sources, merger) {
      if (!isDataStructure(collection)) {
        throw new TypeError(
          'Cannot merge into non-data-structure value: ' + collection
        );
      }
      if (isImmutable(collection)) {
        return collection.mergeWith
          ? collection.mergeWith.apply(collection, [ merger ].concat( sources ))
          : collection.concat.apply(collection, sources);
      }
      var isArray = Array.isArray(collection);
      var merged = collection;
      var Collection$$1 = isArray ? IndexedCollection : KeyedCollection;
      var mergeItem = isArray
        ? function (value) {
            // Copy on write
            if (merged === collection) {
              merged = shallowCopy(merged);
            }
            merged.push(value);
          }
        : function (value, key) {
            var hasVal = hasOwnProperty$1.call(merged, key);
            var nextVal =
              hasVal && merger ? merger(merged[key], value, key) : value;
            if (!hasVal || nextVal !== merged[key]) {
              // Copy on write
              if (merged === collection) {
                merged = shallowCopy(merged);
              }
              merged[key] = nextVal;
            }
          };
      for (var i = 0; i < sources.length; i++) {
        Collection$$1(sources[i]).forEach(mergeItem);
      }
      return merged;
    }

    function deepMergerWith(merger) {
      function deepMerger(oldValue, newValue, key) {
        return isDataStructure(oldValue) && isDataStructure(newValue)
          ? mergeWithSources(oldValue, [newValue], deepMerger)
          : merger ? merger(oldValue, newValue, key) : newValue;
      }
      return deepMerger;
    }

    function mergeDeep() {
      var iters = [], len = arguments.length;
      while ( len-- ) iters[ len ] = arguments[ len ];

      return mergeDeepWithSources(this, iters);
    }

    function mergeDeepWith(merger) {
      var iters = [], len = arguments.length - 1;
      while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

      return mergeDeepWithSources(this, iters, merger);
    }

    function mergeIn(keyPath) {
      var iters = [], len = arguments.length - 1;
      while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

      return updateIn(this, keyPath, emptyMap(), function (m) { return mergeWithSources(m, iters); });
    }

    function mergeDeepIn(keyPath) {
      var iters = [], len = arguments.length - 1;
      while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

      return updateIn(this, keyPath, emptyMap(), function (m) { return mergeDeepWithSources(m, iters); }
      );
    }

    function withMutations(fn) {
      var mutable = this.asMutable();
      fn(mutable);
      return mutable.wasAltered() ? mutable.__ensureOwner(this.__ownerID) : this;
    }

    function asMutable() {
      return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
    }

    function asImmutable() {
      return this.__ensureOwner();
    }

    function wasAltered() {
      return this.__altered;
    }

    var Map$2 = (function (KeyedCollection$$1) {
      function Map(value) {
        return value === null || value === undefined
          ? emptyMap()
          : isMap(value) && !isOrdered(value)
            ? value
            : emptyMap().withMutations(function (map) {
                var iter = KeyedCollection$$1(value);
                assertNotInfinite(iter.size);
                iter.forEach(function (v, k) { return map.set(k, v); });
              });
      }

      if ( KeyedCollection$$1 ) Map.__proto__ = KeyedCollection$$1;
      Map.prototype = Object.create( KeyedCollection$$1 && KeyedCollection$$1.prototype );
      Map.prototype.constructor = Map;

      Map.of = function of () {
        var keyValues = [], len = arguments.length;
        while ( len-- ) keyValues[ len ] = arguments[ len ];

        return emptyMap().withMutations(function (map) {
          for (var i = 0; i < keyValues.length; i += 2) {
            if (i + 1 >= keyValues.length) {
              throw new Error('Missing value for key: ' + keyValues[i]);
            }
            map.set(keyValues[i], keyValues[i + 1]);
          }
        });
      };

      Map.prototype.toString = function toString () {
        return this.__toString('Map {', '}');
      };

      // @pragma Access

      Map.prototype.get = function get (k, notSetValue) {
        return this._root
          ? this._root.get(0, undefined, k, notSetValue)
          : notSetValue;
      };

      // @pragma Modification

      Map.prototype.set = function set (k, v) {
        return updateMap(this, k, v);
      };

      Map.prototype.remove = function remove (k) {
        return updateMap(this, k, NOT_SET);
      };

      Map.prototype.deleteAll = function deleteAll (keys) {
        var collection = Collection(keys);

        if (collection.size === 0) {
          return this;
        }

        return this.withMutations(function (map) {
          collection.forEach(function (key) { return map.remove(key); });
        });
      };

      Map.prototype.clear = function clear () {
        if (this.size === 0) {
          return this;
        }
        if (this.__ownerID) {
          this.size = 0;
          this._root = null;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return emptyMap();
      };

      // @pragma Composition

      Map.prototype.sort = function sort (comparator) {
        // Late binding
        return OrderedMap(sortFactory(this, comparator));
      };

      Map.prototype.sortBy = function sortBy (mapper, comparator) {
        // Late binding
        return OrderedMap(sortFactory(this, comparator, mapper));
      };

      // @pragma Mutability

      Map.prototype.__iterator = function __iterator (type, reverse) {
        return new MapIterator(this, type, reverse);
      };

      Map.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var iterations = 0;
        this._root &&
          this._root.iterate(function (entry) {
            iterations++;
            return fn(entry[1], entry[0], this$1);
          }, reverse);
        return iterations;
      };

      Map.prototype.__ensureOwner = function __ensureOwner (ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        if (!ownerID) {
          if (this.size === 0) {
            return emptyMap();
          }
          this.__ownerID = ownerID;
          this.__altered = false;
          return this;
        }
        return makeMap(this.size, this._root, ownerID, this.__hash);
      };

      return Map;
    }(KeyedCollection));

    function isMap(maybeMap) {
      return !!(maybeMap && maybeMap[IS_MAP_SENTINEL]);
    }

    Map$2.isMap = isMap;

    var IS_MAP_SENTINEL = '@@__IMMUTABLE_MAP__@@';

    var MapPrototype = Map$2.prototype;
    MapPrototype[IS_MAP_SENTINEL] = true;
    MapPrototype[DELETE] = MapPrototype.remove;
    MapPrototype.removeAll = MapPrototype.deleteAll;
    MapPrototype.concat = MapPrototype.merge;
    MapPrototype.setIn = setIn$$1;
    MapPrototype.removeIn = MapPrototype.deleteIn = deleteIn;
    MapPrototype.update = update$$1;
    MapPrototype.updateIn = updateIn$1;
    MapPrototype.merge = merge$2;
    MapPrototype.mergeWith = mergeWith;
    MapPrototype.mergeDeep = mergeDeep;
    MapPrototype.mergeDeepWith = mergeDeepWith;
    MapPrototype.mergeIn = mergeIn;
    MapPrototype.mergeDeepIn = mergeDeepIn;
    MapPrototype.withMutations = withMutations;
    MapPrototype.wasAltered = wasAltered;
    MapPrototype.asImmutable = asImmutable;
    MapPrototype['@@transducer/init'] = MapPrototype.asMutable = asMutable;
    MapPrototype['@@transducer/step'] = function(result, arr) {
      return result.set(arr[0], arr[1]);
    };
    MapPrototype['@@transducer/result'] = function(obj) {
      return obj.asImmutable();
    };

    // #pragma Trie Nodes

    var ArrayMapNode = function ArrayMapNode(ownerID, entries) {
      this.ownerID = ownerID;
      this.entries = entries;
    };

    ArrayMapNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
      var entries = this.entries;
      for (var ii = 0, len = entries.length; ii < len; ii++) {
        if (is(key, entries[ii][0])) {
          return entries[ii][1];
        }
      }
      return notSetValue;
    };

    ArrayMapNode.prototype.update = function update$$1 (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
      var removed = value === NOT_SET;

      var entries = this.entries;
      var idx = 0;
      var len = entries.length;
      for (; idx < len; idx++) {
        if (is(key, entries[idx][0])) {
          break;
        }
      }
      var exists = idx < len;

      if (exists ? entries[idx][1] === value : removed) {
        return this;
      }

      SetRef(didAlter);
      (removed || !exists) && SetRef(didChangeSize);

      if (removed && entries.length === 1) {
        return; // undefined
      }

      if (!exists && !removed && entries.length >= MAX_ARRAY_MAP_SIZE) {
        return createNodes(ownerID, entries, key, value);
      }

      var isEditable = ownerID && ownerID === this.ownerID;
      var newEntries = isEditable ? entries : arrCopy(entries);

      if (exists) {
        if (removed) {
          idx === len - 1
            ? newEntries.pop()
            : (newEntries[idx] = newEntries.pop());
        } else {
          newEntries[idx] = [key, value];
        }
      } else {
        newEntries.push([key, value]);
      }

      if (isEditable) {
        this.entries = newEntries;
        return this;
      }

      return new ArrayMapNode(ownerID, newEntries);
    };

    var BitmapIndexedNode = function BitmapIndexedNode(ownerID, bitmap, nodes) {
      this.ownerID = ownerID;
      this.bitmap = bitmap;
      this.nodes = nodes;
    };

    BitmapIndexedNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
      if (keyHash === undefined) {
        keyHash = hash(key);
      }
      var bit = 1 << ((shift === 0 ? keyHash : keyHash >>> shift) & MASK);
      var bitmap = this.bitmap;
      return (bitmap & bit) === 0
        ? notSetValue
        : this.nodes[popCount(bitmap & (bit - 1))].get(
            shift + SHIFT,
            keyHash,
            key,
            notSetValue
          );
    };

    BitmapIndexedNode.prototype.update = function update$$1 (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
      if (keyHash === undefined) {
        keyHash = hash(key);
      }
      var keyHashFrag = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
      var bit = 1 << keyHashFrag;
      var bitmap = this.bitmap;
      var exists = (bitmap & bit) !== 0;

      if (!exists && value === NOT_SET) {
        return this;
      }

      var idx = popCount(bitmap & (bit - 1));
      var nodes = this.nodes;
      var node = exists ? nodes[idx] : undefined;
      var newNode = updateNode(
        node,
        ownerID,
        shift + SHIFT,
        keyHash,
        key,
        value,
        didChangeSize,
        didAlter
      );

      if (newNode === node) {
        return this;
      }

      if (!exists && newNode && nodes.length >= MAX_BITMAP_INDEXED_SIZE) {
        return expandNodes(ownerID, nodes, bitmap, keyHashFrag, newNode);
      }

      if (
        exists &&
        !newNode &&
        nodes.length === 2 &&
        isLeafNode(nodes[idx ^ 1])
      ) {
        return nodes[idx ^ 1];
      }

      if (exists && newNode && nodes.length === 1 && isLeafNode(newNode)) {
        return newNode;
      }

      var isEditable = ownerID && ownerID === this.ownerID;
      var newBitmap = exists ? (newNode ? bitmap : bitmap ^ bit) : bitmap | bit;
      var newNodes = exists
        ? newNode
          ? setAt(nodes, idx, newNode, isEditable)
          : spliceOut(nodes, idx, isEditable)
        : spliceIn(nodes, idx, newNode, isEditable);

      if (isEditable) {
        this.bitmap = newBitmap;
        this.nodes = newNodes;
        return this;
      }

      return new BitmapIndexedNode(ownerID, newBitmap, newNodes);
    };

    var HashArrayMapNode = function HashArrayMapNode(ownerID, count, nodes) {
      this.ownerID = ownerID;
      this.count = count;
      this.nodes = nodes;
    };

    HashArrayMapNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
      if (keyHash === undefined) {
        keyHash = hash(key);
      }
      var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
      var node = this.nodes[idx];
      return node
        ? node.get(shift + SHIFT, keyHash, key, notSetValue)
        : notSetValue;
    };

    HashArrayMapNode.prototype.update = function update$$1 (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
      if (keyHash === undefined) {
        keyHash = hash(key);
      }
      var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
      var removed = value === NOT_SET;
      var nodes = this.nodes;
      var node = nodes[idx];

      if (removed && !node) {
        return this;
      }

      var newNode = updateNode(
        node,
        ownerID,
        shift + SHIFT,
        keyHash,
        key,
        value,
        didChangeSize,
        didAlter
      );
      if (newNode === node) {
        return this;
      }

      var newCount = this.count;
      if (!node) {
        newCount++;
      } else if (!newNode) {
        newCount--;
        if (newCount < MIN_HASH_ARRAY_MAP_SIZE) {
          return packNodes(ownerID, nodes, newCount, idx);
        }
      }

      var isEditable = ownerID && ownerID === this.ownerID;
      var newNodes = setAt(nodes, idx, newNode, isEditable);

      if (isEditable) {
        this.count = newCount;
        this.nodes = newNodes;
        return this;
      }

      return new HashArrayMapNode(ownerID, newCount, newNodes);
    };

    var HashCollisionNode = function HashCollisionNode(ownerID, keyHash, entries) {
      this.ownerID = ownerID;
      this.keyHash = keyHash;
      this.entries = entries;
    };

    HashCollisionNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
      var entries = this.entries;
      for (var ii = 0, len = entries.length; ii < len; ii++) {
        if (is(key, entries[ii][0])) {
          return entries[ii][1];
        }
      }
      return notSetValue;
    };

    HashCollisionNode.prototype.update = function update$$1 (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
      if (keyHash === undefined) {
        keyHash = hash(key);
      }

      var removed = value === NOT_SET;

      if (keyHash !== this.keyHash) {
        if (removed) {
          return this;
        }
        SetRef(didAlter);
        SetRef(didChangeSize);
        return mergeIntoNode(this, ownerID, shift, keyHash, [key, value]);
      }

      var entries = this.entries;
      var idx = 0;
      var len = entries.length;
      for (; idx < len; idx++) {
        if (is(key, entries[idx][0])) {
          break;
        }
      }
      var exists = idx < len;

      if (exists ? entries[idx][1] === value : removed) {
        return this;
      }

      SetRef(didAlter);
      (removed || !exists) && SetRef(didChangeSize);

      if (removed && len === 2) {
        return new ValueNode(ownerID, this.keyHash, entries[idx ^ 1]);
      }

      var isEditable = ownerID && ownerID === this.ownerID;
      var newEntries = isEditable ? entries : arrCopy(entries);

      if (exists) {
        if (removed) {
          idx === len - 1
            ? newEntries.pop()
            : (newEntries[idx] = newEntries.pop());
        } else {
          newEntries[idx] = [key, value];
        }
      } else {
        newEntries.push([key, value]);
      }

      if (isEditable) {
        this.entries = newEntries;
        return this;
      }

      return new HashCollisionNode(ownerID, this.keyHash, newEntries);
    };

    var ValueNode = function ValueNode(ownerID, keyHash, entry) {
      this.ownerID = ownerID;
      this.keyHash = keyHash;
      this.entry = entry;
    };

    ValueNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
      return is(key, this.entry[0]) ? this.entry[1] : notSetValue;
    };

    ValueNode.prototype.update = function update$$1 (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
      var removed = value === NOT_SET;
      var keyMatch = is(key, this.entry[0]);
      if (keyMatch ? value === this.entry[1] : removed) {
        return this;
      }

      SetRef(didAlter);

      if (removed) {
        SetRef(didChangeSize);
        return; // undefined
      }

      if (keyMatch) {
        if (ownerID && ownerID === this.ownerID) {
          this.entry[1] = value;
          return this;
        }
        return new ValueNode(ownerID, this.keyHash, [key, value]);
      }

      SetRef(didChangeSize);
      return mergeIntoNode(this, ownerID, shift, hash(key), [key, value]);
    };

    // #pragma Iterators

    ArrayMapNode.prototype.iterate = HashCollisionNode.prototype.iterate = function(
      fn,
      reverse
    ) {
      var entries = this.entries;
      for (var ii = 0, maxIndex = entries.length - 1; ii <= maxIndex; ii++) {
        if (fn(entries[reverse ? maxIndex - ii : ii]) === false) {
          return false;
        }
      }
    };

    BitmapIndexedNode.prototype.iterate = HashArrayMapNode.prototype.iterate = function(
      fn,
      reverse
    ) {
      var nodes = this.nodes;
      for (var ii = 0, maxIndex = nodes.length - 1; ii <= maxIndex; ii++) {
        var node = nodes[reverse ? maxIndex - ii : ii];
        if (node && node.iterate(fn, reverse) === false) {
          return false;
        }
      }
    };

    // eslint-disable-next-line no-unused-vars
    ValueNode.prototype.iterate = function(fn, reverse) {
      return fn(this.entry);
    };

    var MapIterator = (function (Iterator$$1) {
      function MapIterator(map, type, reverse) {
        this._type = type;
        this._reverse = reverse;
        this._stack = map._root && mapIteratorFrame(map._root);
      }

      if ( Iterator$$1 ) MapIterator.__proto__ = Iterator$$1;
      MapIterator.prototype = Object.create( Iterator$$1 && Iterator$$1.prototype );
      MapIterator.prototype.constructor = MapIterator;

      MapIterator.prototype.next = function next () {
        var this$1 = this;

        var type = this._type;
        var stack = this._stack;
        while (stack) {
          var node = stack.node;
          var index = stack.index++;
          var maxIndex = (void 0);
          if (node.entry) {
            if (index === 0) {
              return mapIteratorValue(type, node.entry);
            }
          } else if (node.entries) {
            maxIndex = node.entries.length - 1;
            if (index <= maxIndex) {
              return mapIteratorValue(
                type,
                node.entries[this$1._reverse ? maxIndex - index : index]
              );
            }
          } else {
            maxIndex = node.nodes.length - 1;
            if (index <= maxIndex) {
              var subNode = node.nodes[this$1._reverse ? maxIndex - index : index];
              if (subNode) {
                if (subNode.entry) {
                  return mapIteratorValue(type, subNode.entry);
                }
                stack = this$1._stack = mapIteratorFrame(subNode, stack);
              }
              continue;
            }
          }
          stack = this$1._stack = this$1._stack.__prev;
        }
        return iteratorDone();
      };

      return MapIterator;
    }(Iterator));

    function mapIteratorValue(type, entry) {
      return iteratorValue(type, entry[0], entry[1]);
    }

    function mapIteratorFrame(node, prev) {
      return {
        node: node,
        index: 0,
        __prev: prev
      };
    }

    function makeMap(size, root, ownerID, hash$$1) {
      var map = Object.create(MapPrototype);
      map.size = size;
      map._root = root;
      map.__ownerID = ownerID;
      map.__hash = hash$$1;
      map.__altered = false;
      return map;
    }

    var EMPTY_MAP;
    function emptyMap() {
      return EMPTY_MAP || (EMPTY_MAP = makeMap(0));
    }

    function updateMap(map, k, v) {
      var newRoot;
      var newSize;
      if (!map._root) {
        if (v === NOT_SET) {
          return map;
        }
        newSize = 1;
        newRoot = new ArrayMapNode(map.__ownerID, [[k, v]]);
      } else {
        var didChangeSize = MakeRef(CHANGE_LENGTH);
        var didAlter = MakeRef(DID_ALTER);
        newRoot = updateNode(
          map._root,
          map.__ownerID,
          0,
          undefined,
          k,
          v,
          didChangeSize,
          didAlter
        );
        if (!didAlter.value) {
          return map;
        }
        newSize = map.size + (didChangeSize.value ? (v === NOT_SET ? -1 : 1) : 0);
      }
      if (map.__ownerID) {
        map.size = newSize;
        map._root = newRoot;
        map.__hash = undefined;
        map.__altered = true;
        return map;
      }
      return newRoot ? makeMap(newSize, newRoot) : emptyMap();
    }

    function updateNode(
      node,
      ownerID,
      shift,
      keyHash,
      key,
      value,
      didChangeSize,
      didAlter
    ) {
      if (!node) {
        if (value === NOT_SET) {
          return node;
        }
        SetRef(didAlter);
        SetRef(didChangeSize);
        return new ValueNode(ownerID, keyHash, [key, value]);
      }
      return node.update(
        ownerID,
        shift,
        keyHash,
        key,
        value,
        didChangeSize,
        didAlter
      );
    }

    function isLeafNode(node) {
      return (
        node.constructor === ValueNode || node.constructor === HashCollisionNode
      );
    }

    function mergeIntoNode(node, ownerID, shift, keyHash, entry) {
      if (node.keyHash === keyHash) {
        return new HashCollisionNode(ownerID, keyHash, [node.entry, entry]);
      }

      var idx1 = (shift === 0 ? node.keyHash : node.keyHash >>> shift) & MASK;
      var idx2 = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;

      var newNode;
      var nodes =
        idx1 === idx2
          ? [mergeIntoNode(node, ownerID, shift + SHIFT, keyHash, entry)]
          : (newNode = new ValueNode(ownerID, keyHash, entry), idx1 < idx2 ? [node, newNode] : [newNode, node]);

      return new BitmapIndexedNode(ownerID, (1 << idx1) | (1 << idx2), nodes);
    }

    function createNodes(ownerID, entries, key, value) {
      if (!ownerID) {
        ownerID = new OwnerID();
      }
      var node = new ValueNode(ownerID, hash(key), [key, value]);
      for (var ii = 0; ii < entries.length; ii++) {
        var entry = entries[ii];
        node = node.update(ownerID, 0, undefined, entry[0], entry[1]);
      }
      return node;
    }

    function packNodes(ownerID, nodes, count, excluding) {
      var bitmap = 0;
      var packedII = 0;
      var packedNodes = new Array(count);
      for (var ii = 0, bit = 1, len = nodes.length; ii < len; ii++, bit <<= 1) {
        var node = nodes[ii];
        if (node !== undefined && ii !== excluding) {
          bitmap |= bit;
          packedNodes[packedII++] = node;
        }
      }
      return new BitmapIndexedNode(ownerID, bitmap, packedNodes);
    }

    function expandNodes(ownerID, nodes, bitmap, including, node) {
      var count = 0;
      var expandedNodes = new Array(SIZE);
      for (var ii = 0; bitmap !== 0; ii++, bitmap >>>= 1) {
        expandedNodes[ii] = bitmap & 1 ? nodes[count++] : undefined;
      }
      expandedNodes[including] = node;
      return new HashArrayMapNode(ownerID, count + 1, expandedNodes);
    }

    function popCount(x) {
      x -= (x >> 1) & 0x55555555;
      x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
      x = (x + (x >> 4)) & 0x0f0f0f0f;
      x += x >> 8;
      x += x >> 16;
      return x & 0x7f;
    }

    function setAt(array, idx, val, canEdit) {
      var newArray = canEdit ? array : arrCopy(array);
      newArray[idx] = val;
      return newArray;
    }

    function spliceIn(array, idx, val, canEdit) {
      var newLen = array.length + 1;
      if (canEdit && idx + 1 === newLen) {
        array[idx] = val;
        return array;
      }
      var newArray = new Array(newLen);
      var after = 0;
      for (var ii = 0; ii < newLen; ii++) {
        if (ii === idx) {
          newArray[ii] = val;
          after = -1;
        } else {
          newArray[ii] = array[ii + after];
        }
      }
      return newArray;
    }

    function spliceOut(array, idx, canEdit) {
      var newLen = array.length - 1;
      if (canEdit && idx === newLen) {
        array.pop();
        return array;
      }
      var newArray = new Array(newLen);
      var after = 0;
      for (var ii = 0; ii < newLen; ii++) {
        if (ii === idx) {
          after = 1;
        }
        newArray[ii] = array[ii + after];
      }
      return newArray;
    }

    var MAX_ARRAY_MAP_SIZE = SIZE / 4;
    var MAX_BITMAP_INDEXED_SIZE = SIZE / 2;
    var MIN_HASH_ARRAY_MAP_SIZE = SIZE / 4;

    var List = (function (IndexedCollection$$1) {
      function List(value) {
        var empty = emptyList();
        if (value === null || value === undefined) {
          return empty;
        }
        if (isList(value)) {
          return value;
        }
        var iter = IndexedCollection$$1(value);
        var size = iter.size;
        if (size === 0) {
          return empty;
        }
        assertNotInfinite(size);
        if (size > 0 && size < SIZE) {
          return makeList(0, size, SHIFT, null, new VNode(iter.toArray()));
        }
        return empty.withMutations(function (list) {
          list.setSize(size);
          iter.forEach(function (v, i) { return list.set(i, v); });
        });
      }

      if ( IndexedCollection$$1 ) List.__proto__ = IndexedCollection$$1;
      List.prototype = Object.create( IndexedCollection$$1 && IndexedCollection$$1.prototype );
      List.prototype.constructor = List;

      List.of = function of (/*...values*/) {
        return this(arguments);
      };

      List.prototype.toString = function toString () {
        return this.__toString('List [', ']');
      };

      // @pragma Access

      List.prototype.get = function get (index, notSetValue) {
        index = wrapIndex(this, index);
        if (index >= 0 && index < this.size) {
          index += this._origin;
          var node = listNodeFor(this, index);
          return node && node.array[index & MASK];
        }
        return notSetValue;
      };

      // @pragma Modification

      List.prototype.set = function set (index, value) {
        return updateList(this, index, value);
      };

      List.prototype.remove = function remove (index) {
        return !this.has(index)
          ? this
          : index === 0
            ? this.shift()
            : index === this.size - 1 ? this.pop() : this.splice(index, 1);
      };

      List.prototype.insert = function insert (index, value) {
        return this.splice(index, 0, value);
      };

      List.prototype.clear = function clear () {
        if (this.size === 0) {
          return this;
        }
        if (this.__ownerID) {
          this.size = this._origin = this._capacity = 0;
          this._level = SHIFT;
          this._root = this._tail = null;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return emptyList();
      };

      List.prototype.push = function push (/*...values*/) {
        var values = arguments;
        var oldSize = this.size;
        return this.withMutations(function (list) {
          setListBounds(list, 0, oldSize + values.length);
          for (var ii = 0; ii < values.length; ii++) {
            list.set(oldSize + ii, values[ii]);
          }
        });
      };

      List.prototype.pop = function pop () {
        return setListBounds(this, 0, -1);
      };

      List.prototype.unshift = function unshift (/*...values*/) {
        var values = arguments;
        return this.withMutations(function (list) {
          setListBounds(list, -values.length);
          for (var ii = 0; ii < values.length; ii++) {
            list.set(ii, values[ii]);
          }
        });
      };

      List.prototype.shift = function shift () {
        return setListBounds(this, 1);
      };

      // @pragma Composition

      List.prototype.concat = function concat (/*...collections*/) {
        var arguments$1 = arguments;

        var seqs = [];
        for (var i = 0; i < arguments.length; i++) {
          var argument = arguments$1[i];
          var seq = IndexedCollection$$1(
            typeof argument !== 'string' && hasIterator(argument)
              ? argument
              : [argument]
          );
          if (seq.size !== 0) {
            seqs.push(seq);
          }
        }
        if (seqs.length === 0) {
          return this;
        }
        if (this.size === 0 && !this.__ownerID && seqs.length === 1) {
          return this.constructor(seqs[0]);
        }
        return this.withMutations(function (list) {
          seqs.forEach(function (seq) { return seq.forEach(function (value) { return list.push(value); }); });
        });
      };

      List.prototype.setSize = function setSize (size) {
        return setListBounds(this, 0, size);
      };

      // @pragma Iteration

      List.prototype.slice = function slice (begin, end) {
        var size = this.size;
        if (wholeSlice(begin, end, size)) {
          return this;
        }
        return setListBounds(
          this,
          resolveBegin(begin, size),
          resolveEnd(end, size)
        );
      };

      List.prototype.__iterator = function __iterator (type, reverse) {
        var index = reverse ? this.size : 0;
        var values = iterateList(this, reverse);
        return new Iterator(function () {
          var value = values();
          return value === DONE
            ? iteratorDone()
            : iteratorValue(type, reverse ? --index : index++, value);
        });
      };

      List.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var index = reverse ? this.size : 0;
        var values = iterateList(this, reverse);
        var value;
        while ((value = values()) !== DONE) {
          if (fn(value, reverse ? --index : index++, this$1) === false) {
            break;
          }
        }
        return index;
      };

      List.prototype.__ensureOwner = function __ensureOwner (ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        if (!ownerID) {
          if (this.size === 0) {
            return emptyList();
          }
          this.__ownerID = ownerID;
          this.__altered = false;
          return this;
        }
        return makeList(
          this._origin,
          this._capacity,
          this._level,
          this._root,
          this._tail,
          ownerID,
          this.__hash
        );
      };

      return List;
    }(IndexedCollection));

    function isList(maybeList) {
      return !!(maybeList && maybeList[IS_LIST_SENTINEL]);
    }

    List.isList = isList;

    var IS_LIST_SENTINEL = '@@__IMMUTABLE_LIST__@@';

    var ListPrototype = List.prototype;
    ListPrototype[IS_LIST_SENTINEL] = true;
    ListPrototype[DELETE] = ListPrototype.remove;
    ListPrototype.merge = ListPrototype.concat;
    ListPrototype.setIn = setIn$$1;
    ListPrototype.deleteIn = ListPrototype.removeIn = deleteIn;
    ListPrototype.update = update$$1;
    ListPrototype.updateIn = updateIn$1;
    ListPrototype.mergeIn = mergeIn;
    ListPrototype.mergeDeepIn = mergeDeepIn;
    ListPrototype.withMutations = withMutations;
    ListPrototype.wasAltered = wasAltered;
    ListPrototype.asImmutable = asImmutable;
    ListPrototype['@@transducer/init'] = ListPrototype.asMutable = asMutable;
    ListPrototype['@@transducer/step'] = function(result, arr) {
      return result.push(arr);
    };
    ListPrototype['@@transducer/result'] = function(obj) {
      return obj.asImmutable();
    };

    var VNode = function VNode(array, ownerID) {
      this.array = array;
      this.ownerID = ownerID;
    };

    // TODO: seems like these methods are very similar

    VNode.prototype.removeBefore = function removeBefore (ownerID, level, index) {
      if (index === level ? 1 << level : 0 || this.array.length === 0) {
        return this;
      }
      var originIndex = (index >>> level) & MASK;
      if (originIndex >= this.array.length) {
        return new VNode([], ownerID);
      }
      var removingFirst = originIndex === 0;
      var newChild;
      if (level > 0) {
        var oldChild = this.array[originIndex];
        newChild =
          oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
        if (newChild === oldChild && removingFirst) {
          return this;
        }
      }
      if (removingFirst && !newChild) {
        return this;
      }
      var editable = editableVNode(this, ownerID);
      if (!removingFirst) {
        for (var ii = 0; ii < originIndex; ii++) {
          editable.array[ii] = undefined;
        }
      }
      if (newChild) {
        editable.array[originIndex] = newChild;
      }
      return editable;
    };

    VNode.prototype.removeAfter = function removeAfter (ownerID, level, index) {
      if (index === (level ? 1 << level : 0) || this.array.length === 0) {
        return this;
      }
      var sizeIndex = ((index - 1) >>> level) & MASK;
      if (sizeIndex >= this.array.length) {
        return this;
      }

      var newChild;
      if (level > 0) {
        var oldChild = this.array[sizeIndex];
        newChild =
          oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
        if (newChild === oldChild && sizeIndex === this.array.length - 1) {
          return this;
        }
      }

      var editable = editableVNode(this, ownerID);
      editable.array.splice(sizeIndex + 1);
      if (newChild) {
        editable.array[sizeIndex] = newChild;
      }
      return editable;
    };

    var DONE = {};

    function iterateList(list, reverse) {
      var left = list._origin;
      var right = list._capacity;
      var tailPos = getTailOffset(right);
      var tail = list._tail;

      return iterateNodeOrLeaf(list._root, list._level, 0);

      function iterateNodeOrLeaf(node, level, offset) {
        return level === 0
          ? iterateLeaf(node, offset)
          : iterateNode(node, level, offset);
      }

      function iterateLeaf(node, offset) {
        var array = offset === tailPos ? tail && tail.array : node && node.array;
        var from = offset > left ? 0 : left - offset;
        var to = right - offset;
        if (to > SIZE) {
          to = SIZE;
        }
        return function () {
          if (from === to) {
            return DONE;
          }
          var idx = reverse ? --to : from++;
          return array && array[idx];
        };
      }

      function iterateNode(node, level, offset) {
        var values;
        var array = node && node.array;
        var from = offset > left ? 0 : (left - offset) >> level;
        var to = ((right - offset) >> level) + 1;
        if (to > SIZE) {
          to = SIZE;
        }
        return function () {
          while (true) {
            if (values) {
              var value = values();
              if (value !== DONE) {
                return value;
              }
              values = null;
            }
            if (from === to) {
              return DONE;
            }
            var idx = reverse ? --to : from++;
            values = iterateNodeOrLeaf(
              array && array[idx],
              level - SHIFT,
              offset + (idx << level)
            );
          }
        };
      }
    }

    function makeList(origin, capacity, level, root, tail, ownerID, hash) {
      var list = Object.create(ListPrototype);
      list.size = capacity - origin;
      list._origin = origin;
      list._capacity = capacity;
      list._level = level;
      list._root = root;
      list._tail = tail;
      list.__ownerID = ownerID;
      list.__hash = hash;
      list.__altered = false;
      return list;
    }

    var EMPTY_LIST;
    function emptyList() {
      return EMPTY_LIST || (EMPTY_LIST = makeList(0, 0, SHIFT));
    }

    function updateList(list, index, value) {
      index = wrapIndex(list, index);

      if (index !== index) {
        return list;
      }

      if (index >= list.size || index < 0) {
        return list.withMutations(function (list) {
          index < 0
            ? setListBounds(list, index).set(0, value)
            : setListBounds(list, 0, index + 1).set(index, value);
        });
      }

      index += list._origin;

      var newTail = list._tail;
      var newRoot = list._root;
      var didAlter = MakeRef(DID_ALTER);
      if (index >= getTailOffset(list._capacity)) {
        newTail = updateVNode(newTail, list.__ownerID, 0, index, value, didAlter);
      } else {
        newRoot = updateVNode(
          newRoot,
          list.__ownerID,
          list._level,
          index,
          value,
          didAlter
        );
      }

      if (!didAlter.value) {
        return list;
      }

      if (list.__ownerID) {
        list._root = newRoot;
        list._tail = newTail;
        list.__hash = undefined;
        list.__altered = true;
        return list;
      }
      return makeList(list._origin, list._capacity, list._level, newRoot, newTail);
    }

    function updateVNode(node, ownerID, level, index, value, didAlter) {
      var idx = (index >>> level) & MASK;
      var nodeHas = node && idx < node.array.length;
      if (!nodeHas && value === undefined) {
        return node;
      }

      var newNode;

      if (level > 0) {
        var lowerNode = node && node.array[idx];
        var newLowerNode = updateVNode(
          lowerNode,
          ownerID,
          level - SHIFT,
          index,
          value,
          didAlter
        );
        if (newLowerNode === lowerNode) {
          return node;
        }
        newNode = editableVNode(node, ownerID);
        newNode.array[idx] = newLowerNode;
        return newNode;
      }

      if (nodeHas && node.array[idx] === value) {
        return node;
      }

      SetRef(didAlter);

      newNode = editableVNode(node, ownerID);
      if (value === undefined && idx === newNode.array.length - 1) {
        newNode.array.pop();
      } else {
        newNode.array[idx] = value;
      }
      return newNode;
    }

    function editableVNode(node, ownerID) {
      if (ownerID && node && ownerID === node.ownerID) {
        return node;
      }
      return new VNode(node ? node.array.slice() : [], ownerID);
    }

    function listNodeFor(list, rawIndex) {
      if (rawIndex >= getTailOffset(list._capacity)) {
        return list._tail;
      }
      if (rawIndex < 1 << (list._level + SHIFT)) {
        var node = list._root;
        var level = list._level;
        while (node && level > 0) {
          node = node.array[(rawIndex >>> level) & MASK];
          level -= SHIFT;
        }
        return node;
      }
    }

    function setListBounds(list, begin, end) {
      // Sanitize begin & end using this shorthand for ToInt32(argument)
      // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
      if (begin !== undefined) {
        begin |= 0;
      }
      if (end !== undefined) {
        end |= 0;
      }
      var owner = list.__ownerID || new OwnerID();
      var oldOrigin = list._origin;
      var oldCapacity = list._capacity;
      var newOrigin = oldOrigin + begin;
      var newCapacity =
        end === undefined
          ? oldCapacity
          : end < 0 ? oldCapacity + end : oldOrigin + end;
      if (newOrigin === oldOrigin && newCapacity === oldCapacity) {
        return list;
      }

      // If it's going to end after it starts, it's empty.
      if (newOrigin >= newCapacity) {
        return list.clear();
      }

      var newLevel = list._level;
      var newRoot = list._root;

      // New origin might need creating a higher root.
      var offsetShift = 0;
      while (newOrigin + offsetShift < 0) {
        newRoot = new VNode(
          newRoot && newRoot.array.length ? [undefined, newRoot] : [],
          owner
        );
        newLevel += SHIFT;
        offsetShift += 1 << newLevel;
      }
      if (offsetShift) {
        newOrigin += offsetShift;
        oldOrigin += offsetShift;
        newCapacity += offsetShift;
        oldCapacity += offsetShift;
      }

      var oldTailOffset = getTailOffset(oldCapacity);
      var newTailOffset = getTailOffset(newCapacity);

      // New size might need creating a higher root.
      while (newTailOffset >= 1 << (newLevel + SHIFT)) {
        newRoot = new VNode(
          newRoot && newRoot.array.length ? [newRoot] : [],
          owner
        );
        newLevel += SHIFT;
      }

      // Locate or create the new tail.
      var oldTail = list._tail;
      var newTail =
        newTailOffset < oldTailOffset
          ? listNodeFor(list, newCapacity - 1)
          : newTailOffset > oldTailOffset ? new VNode([], owner) : oldTail;

      // Merge Tail into tree.
      if (
        oldTail &&
        newTailOffset > oldTailOffset &&
        newOrigin < oldCapacity &&
        oldTail.array.length
      ) {
        newRoot = editableVNode(newRoot, owner);
        var node = newRoot;
        for (var level = newLevel; level > SHIFT; level -= SHIFT) {
          var idx = (oldTailOffset >>> level) & MASK;
          node = node.array[idx] = editableVNode(node.array[idx], owner);
        }
        node.array[(oldTailOffset >>> SHIFT) & MASK] = oldTail;
      }

      // If the size has been reduced, there's a chance the tail needs to be trimmed.
      if (newCapacity < oldCapacity) {
        newTail = newTail && newTail.removeAfter(owner, 0, newCapacity);
      }

      // If the new origin is within the tail, then we do not need a root.
      if (newOrigin >= newTailOffset) {
        newOrigin -= newTailOffset;
        newCapacity -= newTailOffset;
        newLevel = SHIFT;
        newRoot = null;
        newTail = newTail && newTail.removeBefore(owner, 0, newOrigin);

        // Otherwise, if the root has been trimmed, garbage collect.
      } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
        offsetShift = 0;

        // Identify the new top root node of the subtree of the old root.
        while (newRoot) {
          var beginIndex = (newOrigin >>> newLevel) & MASK;
          if ((beginIndex !== newTailOffset >>> newLevel) & MASK) {
            break;
          }
          if (beginIndex) {
            offsetShift += (1 << newLevel) * beginIndex;
          }
          newLevel -= SHIFT;
          newRoot = newRoot.array[beginIndex];
        }

        // Trim the new sides of the new root.
        if (newRoot && newOrigin > oldOrigin) {
          newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
        }
        if (newRoot && newTailOffset < oldTailOffset) {
          newRoot = newRoot.removeAfter(
            owner,
            newLevel,
            newTailOffset - offsetShift
          );
        }
        if (offsetShift) {
          newOrigin -= offsetShift;
          newCapacity -= offsetShift;
        }
      }

      if (list.__ownerID) {
        list.size = newCapacity - newOrigin;
        list._origin = newOrigin;
        list._capacity = newCapacity;
        list._level = newLevel;
        list._root = newRoot;
        list._tail = newTail;
        list.__hash = undefined;
        list.__altered = true;
        return list;
      }
      return makeList(newOrigin, newCapacity, newLevel, newRoot, newTail);
    }

    function getTailOffset(size) {
      return size < SIZE ? 0 : ((size - 1) >>> SHIFT) << SHIFT;
    }

    var OrderedMap = (function (Map$$1) {
      function OrderedMap(value) {
        return value === null || value === undefined
          ? emptyOrderedMap()
          : isOrderedMap(value)
            ? value
            : emptyOrderedMap().withMutations(function (map) {
                var iter = KeyedCollection(value);
                assertNotInfinite(iter.size);
                iter.forEach(function (v, k) { return map.set(k, v); });
              });
      }

      if ( Map$$1 ) OrderedMap.__proto__ = Map$$1;
      OrderedMap.prototype = Object.create( Map$$1 && Map$$1.prototype );
      OrderedMap.prototype.constructor = OrderedMap;

      OrderedMap.of = function of (/*...values*/) {
        return this(arguments);
      };

      OrderedMap.prototype.toString = function toString () {
        return this.__toString('OrderedMap {', '}');
      };

      // @pragma Access

      OrderedMap.prototype.get = function get (k, notSetValue) {
        var index = this._map.get(k);
        return index !== undefined ? this._list.get(index)[1] : notSetValue;
      };

      // @pragma Modification

      OrderedMap.prototype.clear = function clear () {
        if (this.size === 0) {
          return this;
        }
        if (this.__ownerID) {
          this.size = 0;
          this._map.clear();
          this._list.clear();
          return this;
        }
        return emptyOrderedMap();
      };

      OrderedMap.prototype.set = function set (k, v) {
        return updateOrderedMap(this, k, v);
      };

      OrderedMap.prototype.remove = function remove (k) {
        return updateOrderedMap(this, k, NOT_SET);
      };

      OrderedMap.prototype.wasAltered = function wasAltered () {
        return this._map.wasAltered() || this._list.wasAltered();
      };

      OrderedMap.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        return this._list.__iterate(
          function (entry) { return entry && fn(entry[1], entry[0], this$1); },
          reverse
        );
      };

      OrderedMap.prototype.__iterator = function __iterator (type, reverse) {
        return this._list.fromEntrySeq().__iterator(type, reverse);
      };

      OrderedMap.prototype.__ensureOwner = function __ensureOwner (ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        var newMap = this._map.__ensureOwner(ownerID);
        var newList = this._list.__ensureOwner(ownerID);
        if (!ownerID) {
          if (this.size === 0) {
            return emptyOrderedMap();
          }
          this.__ownerID = ownerID;
          this._map = newMap;
          this._list = newList;
          return this;
        }
        return makeOrderedMap(newMap, newList, ownerID, this.__hash);
      };

      return OrderedMap;
    }(Map$2));

    function isOrderedMap(maybeOrderedMap) {
      return isMap(maybeOrderedMap) && isOrdered(maybeOrderedMap);
    }

    OrderedMap.isOrderedMap = isOrderedMap;

    OrderedMap.prototype[IS_ORDERED_SENTINEL] = true;
    OrderedMap.prototype[DELETE] = OrderedMap.prototype.remove;

    function makeOrderedMap(map, list, ownerID, hash) {
      var omap = Object.create(OrderedMap.prototype);
      omap.size = map ? map.size : 0;
      omap._map = map;
      omap._list = list;
      omap.__ownerID = ownerID;
      omap.__hash = hash;
      return omap;
    }

    var EMPTY_ORDERED_MAP;
    function emptyOrderedMap() {
      return (
        EMPTY_ORDERED_MAP ||
        (EMPTY_ORDERED_MAP = makeOrderedMap(emptyMap(), emptyList()))
      );
    }

    function updateOrderedMap(omap, k, v) {
      var map = omap._map;
      var list = omap._list;
      var i = map.get(k);
      var has = i !== undefined;
      var newMap;
      var newList;
      if (v === NOT_SET) {
        // removed
        if (!has) {
          return omap;
        }
        if (list.size >= SIZE && list.size >= map.size * 2) {
          newList = list.filter(function (entry, idx) { return entry !== undefined && i !== idx; });
          newMap = newList
            .toKeyedSeq()
            .map(function (entry) { return entry[0]; })
            .flip()
            .toMap();
          if (omap.__ownerID) {
            newMap.__ownerID = newList.__ownerID = omap.__ownerID;
          }
        } else {
          newMap = map.remove(k);
          newList = i === list.size - 1 ? list.pop() : list.set(i, undefined);
        }
      } else if (has) {
        if (v === list.get(i)[1]) {
          return omap;
        }
        newMap = map;
        newList = list.set(i, [k, v]);
      } else {
        newMap = map.set(k, list.size);
        newList = list.set(list.size, [k, v]);
      }
      if (omap.__ownerID) {
        omap.size = newMap.size;
        omap._map = newMap;
        omap._list = newList;
        omap.__hash = undefined;
        return omap;
      }
      return makeOrderedMap(newMap, newList);
    }

    var Stack = (function (IndexedCollection$$1) {
      function Stack(value) {
        return value === null || value === undefined
          ? emptyStack()
          : isStack(value) ? value : emptyStack().pushAll(value);
      }

      if ( IndexedCollection$$1 ) Stack.__proto__ = IndexedCollection$$1;
      Stack.prototype = Object.create( IndexedCollection$$1 && IndexedCollection$$1.prototype );
      Stack.prototype.constructor = Stack;

      Stack.of = function of (/*...values*/) {
        return this(arguments);
      };

      Stack.prototype.toString = function toString () {
        return this.__toString('Stack [', ']');
      };

      // @pragma Access

      Stack.prototype.get = function get (index, notSetValue) {
        var head = this._head;
        index = wrapIndex(this, index);
        while (head && index--) {
          head = head.next;
        }
        return head ? head.value : notSetValue;
      };

      Stack.prototype.peek = function peek () {
        return this._head && this._head.value;
      };

      // @pragma Modification

      Stack.prototype.push = function push (/*...values*/) {
        var arguments$1 = arguments;

        if (arguments.length === 0) {
          return this;
        }
        var newSize = this.size + arguments.length;
        var head = this._head;
        for (var ii = arguments.length - 1; ii >= 0; ii--) {
          head = {
            value: arguments$1[ii],
            next: head
          };
        }
        if (this.__ownerID) {
          this.size = newSize;
          this._head = head;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return makeStack(newSize, head);
      };

      Stack.prototype.pushAll = function pushAll (iter) {
        iter = IndexedCollection$$1(iter);
        if (iter.size === 0) {
          return this;
        }
        if (this.size === 0 && isStack(iter)) {
          return iter;
        }
        assertNotInfinite(iter.size);
        var newSize = this.size;
        var head = this._head;
        iter.__iterate(function (value) {
          newSize++;
          head = {
            value: value,
            next: head
          };
        }, /* reverse */ true);
        if (this.__ownerID) {
          this.size = newSize;
          this._head = head;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return makeStack(newSize, head);
      };

      Stack.prototype.pop = function pop () {
        return this.slice(1);
      };

      Stack.prototype.clear = function clear () {
        if (this.size === 0) {
          return this;
        }
        if (this.__ownerID) {
          this.size = 0;
          this._head = undefined;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return emptyStack();
      };

      Stack.prototype.slice = function slice (begin, end) {
        if (wholeSlice(begin, end, this.size)) {
          return this;
        }
        var resolvedBegin = resolveBegin(begin, this.size);
        var resolvedEnd = resolveEnd(end, this.size);
        if (resolvedEnd !== this.size) {
          // super.slice(begin, end);
          return IndexedCollection$$1.prototype.slice.call(this, begin, end);
        }
        var newSize = this.size - resolvedBegin;
        var head = this._head;
        while (resolvedBegin--) {
          head = head.next;
        }
        if (this.__ownerID) {
          this.size = newSize;
          this._head = head;
          this.__hash = undefined;
          this.__altered = true;
          return this;
        }
        return makeStack(newSize, head);
      };

      // @pragma Mutability

      Stack.prototype.__ensureOwner = function __ensureOwner (ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        if (!ownerID) {
          if (this.size === 0) {
            return emptyStack();
          }
          this.__ownerID = ownerID;
          this.__altered = false;
          return this;
        }
        return makeStack(this.size, this._head, ownerID, this.__hash);
      };

      // @pragma Iteration

      Stack.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        if (reverse) {
          return new ArraySeq(this.toArray()).__iterate(
            function (v, k) { return fn(v, k, this$1); },
            reverse
          );
        }
        var iterations = 0;
        var node = this._head;
        while (node) {
          if (fn(node.value, iterations++, this$1) === false) {
            break;
          }
          node = node.next;
        }
        return iterations;
      };

      Stack.prototype.__iterator = function __iterator (type, reverse) {
        if (reverse) {
          return new ArraySeq(this.toArray()).__iterator(type, reverse);
        }
        var iterations = 0;
        var node = this._head;
        return new Iterator(function () {
          if (node) {
            var value = node.value;
            node = node.next;
            return iteratorValue(type, iterations++, value);
          }
          return iteratorDone();
        });
      };

      return Stack;
    }(IndexedCollection));

    function isStack(maybeStack) {
      return !!(maybeStack && maybeStack[IS_STACK_SENTINEL]);
    }

    Stack.isStack = isStack;

    var IS_STACK_SENTINEL = '@@__IMMUTABLE_STACK__@@';

    var StackPrototype = Stack.prototype;
    StackPrototype[IS_STACK_SENTINEL] = true;
    StackPrototype.shift = StackPrototype.pop;
    StackPrototype.unshift = StackPrototype.push;
    StackPrototype.unshiftAll = StackPrototype.pushAll;
    StackPrototype.withMutations = withMutations;
    StackPrototype.wasAltered = wasAltered;
    StackPrototype.asImmutable = asImmutable;
    StackPrototype['@@transducer/init'] = StackPrototype.asMutable = asMutable;
    StackPrototype['@@transducer/step'] = function(result, arr) {
      return result.unshift(arr);
    };
    StackPrototype['@@transducer/result'] = function(obj) {
      return obj.asImmutable();
    };

    function makeStack(size, head, ownerID, hash) {
      var map = Object.create(StackPrototype);
      map.size = size;
      map._head = head;
      map.__ownerID = ownerID;
      map.__hash = hash;
      map.__altered = false;
      return map;
    }

    var EMPTY_STACK;
    function emptyStack() {
      return EMPTY_STACK || (EMPTY_STACK = makeStack(0));
    }

    function deepEqual(a, b) {
      if (a === b) {
        return true;
      }

      if (
        !isCollection(b) ||
        (a.size !== undefined && b.size !== undefined && a.size !== b.size) ||
        (a.__hash !== undefined &&
          b.__hash !== undefined &&
          a.__hash !== b.__hash) ||
        isKeyed(a) !== isKeyed(b) ||
        isIndexed(a) !== isIndexed(b) ||
        isOrdered(a) !== isOrdered(b)
      ) {
        return false;
      }

      if (a.size === 0 && b.size === 0) {
        return true;
      }

      var notAssociative = !isAssociative(a);

      if (isOrdered(a)) {
        var entries = a.entries();
        return (
          b.every(function (v, k) {
            var entry = entries.next().value;
            return entry && is(entry[1], v) && (notAssociative || is(entry[0], k));
          }) && entries.next().done
        );
      }

      var flipped = false;

      if (a.size === undefined) {
        if (b.size === undefined) {
          if (typeof a.cacheResult === 'function') {
            a.cacheResult();
          }
        } else {
          flipped = true;
          var _ = a;
          a = b;
          b = _;
        }
      }

      var allEqual = true;
      var bSize = b.__iterate(function (v, k) {
        if (
          notAssociative
            ? !a.has(v)
            : flipped ? !is(v, a.get(k, NOT_SET)) : !is(a.get(k, NOT_SET), v)
        ) {
          allEqual = false;
          return false;
        }
      });

      return allEqual && a.size === bSize;
    }

    /**
     * Contributes additional methods to a constructor
     */
    function mixin(ctor, methods) {
      var keyCopier = function (key) {
        ctor.prototype[key] = methods[key];
      };
      Object.keys(methods).forEach(keyCopier);
      Object.getOwnPropertySymbols &&
        Object.getOwnPropertySymbols(methods).forEach(keyCopier);
      return ctor;
    }

    function toJS(value) {
      return isDataStructure(value)
        ? Seq(value)
            .map(toJS)
            .toJSON()
        : value;
    }

    var Set = (function (SetCollection$$1) {
      function Set(value) {
        return value === null || value === undefined
          ? emptySet()
          : isSet(value) && !isOrdered(value)
            ? value
            : emptySet().withMutations(function (set) {
                var iter = SetCollection$$1(value);
                assertNotInfinite(iter.size);
                iter.forEach(function (v) { return set.add(v); });
              });
      }

      if ( SetCollection$$1 ) Set.__proto__ = SetCollection$$1;
      Set.prototype = Object.create( SetCollection$$1 && SetCollection$$1.prototype );
      Set.prototype.constructor = Set;

      Set.of = function of (/*...values*/) {
        return this(arguments);
      };

      Set.fromKeys = function fromKeys (value) {
        return this(KeyedCollection(value).keySeq());
      };

      Set.intersect = function intersect (sets) {
        sets = Collection(sets).toArray();
        return sets.length
          ? SetPrototype.intersect.apply(Set(sets.pop()), sets)
          : emptySet();
      };

      Set.union = function union (sets) {
        sets = Collection(sets).toArray();
        return sets.length
          ? SetPrototype.union.apply(Set(sets.pop()), sets)
          : emptySet();
      };

      Set.prototype.toString = function toString () {
        return this.__toString('Set {', '}');
      };

      // @pragma Access

      Set.prototype.has = function has (value) {
        return this._map.has(value);
      };

      // @pragma Modification

      Set.prototype.add = function add (value) {
        return updateSet(this, this._map.set(value, value));
      };

      Set.prototype.remove = function remove (value) {
        return updateSet(this, this._map.remove(value));
      };

      Set.prototype.clear = function clear () {
        return updateSet(this, this._map.clear());
      };

      // @pragma Composition

      Set.prototype.union = function union () {
        var iters = [], len = arguments.length;
        while ( len-- ) iters[ len ] = arguments[ len ];

        iters = iters.filter(function (x) { return x.size !== 0; });
        if (iters.length === 0) {
          return this;
        }
        if (this.size === 0 && !this.__ownerID && iters.length === 1) {
          return this.constructor(iters[0]);
        }
        return this.withMutations(function (set) {
          for (var ii = 0; ii < iters.length; ii++) {
            SetCollection$$1(iters[ii]).forEach(function (value) { return set.add(value); });
          }
        });
      };

      Set.prototype.intersect = function intersect () {
        var iters = [], len = arguments.length;
        while ( len-- ) iters[ len ] = arguments[ len ];

        if (iters.length === 0) {
          return this;
        }
        iters = iters.map(function (iter) { return SetCollection$$1(iter); });
        var toRemove = [];
        this.forEach(function (value) {
          if (!iters.every(function (iter) { return iter.includes(value); })) {
            toRemove.push(value);
          }
        });
        return this.withMutations(function (set) {
          toRemove.forEach(function (value) {
            set.remove(value);
          });
        });
      };

      Set.prototype.subtract = function subtract () {
        var iters = [], len = arguments.length;
        while ( len-- ) iters[ len ] = arguments[ len ];

        if (iters.length === 0) {
          return this;
        }
        iters = iters.map(function (iter) { return SetCollection$$1(iter); });
        var toRemove = [];
        this.forEach(function (value) {
          if (iters.some(function (iter) { return iter.includes(value); })) {
            toRemove.push(value);
          }
        });
        return this.withMutations(function (set) {
          toRemove.forEach(function (value) {
            set.remove(value);
          });
        });
      };

      Set.prototype.sort = function sort (comparator) {
        // Late binding
        return OrderedSet(sortFactory(this, comparator));
      };

      Set.prototype.sortBy = function sortBy (mapper, comparator) {
        // Late binding
        return OrderedSet(sortFactory(this, comparator, mapper));
      };

      Set.prototype.wasAltered = function wasAltered () {
        return this._map.wasAltered();
      };

      Set.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        return this._map.__iterate(function (k) { return fn(k, k, this$1); }, reverse);
      };

      Set.prototype.__iterator = function __iterator (type, reverse) {
        return this._map.__iterator(type, reverse);
      };

      Set.prototype.__ensureOwner = function __ensureOwner (ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        var newMap = this._map.__ensureOwner(ownerID);
        if (!ownerID) {
          if (this.size === 0) {
            return this.__empty();
          }
          this.__ownerID = ownerID;
          this._map = newMap;
          return this;
        }
        return this.__make(newMap, ownerID);
      };

      return Set;
    }(SetCollection));

    function isSet(maybeSet) {
      return !!(maybeSet && maybeSet[IS_SET_SENTINEL]);
    }

    Set.isSet = isSet;

    var IS_SET_SENTINEL = '@@__IMMUTABLE_SET__@@';

    var SetPrototype = Set.prototype;
    SetPrototype[IS_SET_SENTINEL] = true;
    SetPrototype[DELETE] = SetPrototype.remove;
    SetPrototype.merge = SetPrototype.concat = SetPrototype.union;
    SetPrototype.withMutations = withMutations;
    SetPrototype.asImmutable = asImmutable;
    SetPrototype['@@transducer/init'] = SetPrototype.asMutable = asMutable;
    SetPrototype['@@transducer/step'] = function(result, arr) {
      return result.add(arr);
    };
    SetPrototype['@@transducer/result'] = function(obj) {
      return obj.asImmutable();
    };

    SetPrototype.__empty = emptySet;
    SetPrototype.__make = makeSet;

    function updateSet(set, newMap) {
      if (set.__ownerID) {
        set.size = newMap.size;
        set._map = newMap;
        return set;
      }
      return newMap === set._map
        ? set
        : newMap.size === 0 ? set.__empty() : set.__make(newMap);
    }

    function makeSet(map, ownerID) {
      var set = Object.create(SetPrototype);
      set.size = map ? map.size : 0;
      set._map = map;
      set.__ownerID = ownerID;
      return set;
    }

    var EMPTY_SET;
    function emptySet() {
      return EMPTY_SET || (EMPTY_SET = makeSet(emptyMap()));
    }

    /**
     * Returns a lazy seq of nums from start (inclusive) to end
     * (exclusive), by step, where start defaults to 0, step to 1, and end to
     * infinity. When start is equal to end, returns empty list.
     */
    var Range = (function (IndexedSeq$$1) {
      function Range(start, end, step) {
        if (!(this instanceof Range)) {
          return new Range(start, end, step);
        }
        invariant(step !== 0, 'Cannot step a Range by 0');
        start = start || 0;
        if (end === undefined) {
          end = Infinity;
        }
        step = step === undefined ? 1 : Math.abs(step);
        if (end < start) {
          step = -step;
        }
        this._start = start;
        this._end = end;
        this._step = step;
        this.size = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
        if (this.size === 0) {
          if (EMPTY_RANGE) {
            return EMPTY_RANGE;
          }
          EMPTY_RANGE = this;
        }
      }

      if ( IndexedSeq$$1 ) Range.__proto__ = IndexedSeq$$1;
      Range.prototype = Object.create( IndexedSeq$$1 && IndexedSeq$$1.prototype );
      Range.prototype.constructor = Range;

      Range.prototype.toString = function toString () {
        if (this.size === 0) {
          return 'Range []';
        }
        return (
          'Range [ ' +
          this._start +
          '...' +
          this._end +
          (this._step !== 1 ? ' by ' + this._step : '') +
          ' ]'
        );
      };

      Range.prototype.get = function get (index, notSetValue) {
        return this.has(index)
          ? this._start + wrapIndex(this, index) * this._step
          : notSetValue;
      };

      Range.prototype.includes = function includes (searchValue) {
        var possibleIndex = (searchValue - this._start) / this._step;
        return (
          possibleIndex >= 0 &&
          possibleIndex < this.size &&
          possibleIndex === Math.floor(possibleIndex)
        );
      };

      Range.prototype.slice = function slice (begin, end) {
        if (wholeSlice(begin, end, this.size)) {
          return this;
        }
        begin = resolveBegin(begin, this.size);
        end = resolveEnd(end, this.size);
        if (end <= begin) {
          return new Range(0, 0);
        }
        return new Range(
          this.get(begin, this._end),
          this.get(end, this._end),
          this._step
        );
      };

      Range.prototype.indexOf = function indexOf (searchValue) {
        var offsetValue = searchValue - this._start;
        if (offsetValue % this._step === 0) {
          var index = offsetValue / this._step;
          if (index >= 0 && index < this.size) {
            return index;
          }
        }
        return -1;
      };

      Range.prototype.lastIndexOf = function lastIndexOf (searchValue) {
        return this.indexOf(searchValue);
      };

      Range.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var size = this.size;
        var step = this._step;
        var value = reverse ? this._start + (size - 1) * step : this._start;
        var i = 0;
        while (i !== size) {
          if (fn(value, reverse ? size - ++i : i++, this$1) === false) {
            break;
          }
          value += reverse ? -step : step;
        }
        return i;
      };

      Range.prototype.__iterator = function __iterator (type, reverse) {
        var size = this.size;
        var step = this._step;
        var value = reverse ? this._start + (size - 1) * step : this._start;
        var i = 0;
        return new Iterator(function () {
          if (i === size) {
            return iteratorDone();
          }
          var v = value;
          value += reverse ? -step : step;
          return iteratorValue(type, reverse ? size - ++i : i++, v);
        });
      };

      Range.prototype.equals = function equals (other) {
        return other instanceof Range
          ? this._start === other._start &&
              this._end === other._end &&
              this._step === other._step
          : deepEqual(this, other);
      };

      return Range;
    }(IndexedSeq));

    var EMPTY_RANGE;

    function getIn$1(collection, searchKeyPath, notSetValue) {
      var keyPath = coerceKeyPath(searchKeyPath);
      var i = 0;
      while (i !== keyPath.length) {
        collection = get(collection, keyPath[i++], NOT_SET);
        if (collection === NOT_SET) {
          return notSetValue;
        }
      }
      return collection;
    }

    function getIn$$1(searchKeyPath, notSetValue) {
      return getIn$1(this, searchKeyPath, notSetValue);
    }

    function hasIn$1(collection, keyPath) {
      return getIn$1(collection, keyPath, NOT_SET) !== NOT_SET;
    }

    function hasIn$$1(searchKeyPath) {
      return hasIn$1(this, searchKeyPath);
    }

    function toObject() {
      assertNotInfinite(this.size);
      var object = {};
      this.__iterate(function (v, k) {
        object[k] = v;
      });
      return object;
    }

    // Note: all of these methods are deprecated.
    Collection.isIterable = isCollection;
    Collection.isKeyed = isKeyed;
    Collection.isIndexed = isIndexed;
    Collection.isAssociative = isAssociative;
    Collection.isOrdered = isOrdered;

    Collection.Iterator = Iterator;

    mixin(Collection, {
      // ### Conversion to other types

      toArray: function toArray() {
        assertNotInfinite(this.size);
        var array = new Array(this.size || 0);
        var useTuples = isKeyed(this);
        var i = 0;
        this.__iterate(function (v, k) {
          // Keyed collections produce an array of tuples.
          array[i++] = useTuples ? [k, v] : v;
        });
        return array;
      },

      toIndexedSeq: function toIndexedSeq() {
        return new ToIndexedSequence(this);
      },

      toJS: function toJS$1() {
        return toJS(this);
      },

      toKeyedSeq: function toKeyedSeq() {
        return new ToKeyedSequence(this, true);
      },

      toMap: function toMap() {
        // Use Late Binding here to solve the circular dependency.
        return Map$2(this.toKeyedSeq());
      },

      toObject: toObject,

      toOrderedMap: function toOrderedMap() {
        // Use Late Binding here to solve the circular dependency.
        return OrderedMap(this.toKeyedSeq());
      },

      toOrderedSet: function toOrderedSet() {
        // Use Late Binding here to solve the circular dependency.
        return OrderedSet(isKeyed(this) ? this.valueSeq() : this);
      },

      toSet: function toSet() {
        // Use Late Binding here to solve the circular dependency.
        return Set(isKeyed(this) ? this.valueSeq() : this);
      },

      toSetSeq: function toSetSeq() {
        return new ToSetSequence(this);
      },

      toSeq: function toSeq() {
        return isIndexed(this)
          ? this.toIndexedSeq()
          : isKeyed(this) ? this.toKeyedSeq() : this.toSetSeq();
      },

      toStack: function toStack() {
        // Use Late Binding here to solve the circular dependency.
        return Stack(isKeyed(this) ? this.valueSeq() : this);
      },

      toList: function toList() {
        // Use Late Binding here to solve the circular dependency.
        return List(isKeyed(this) ? this.valueSeq() : this);
      },

      // ### Common JavaScript methods and properties

      toString: function toString() {
        return '[Collection]';
      },

      __toString: function __toString(head, tail) {
        if (this.size === 0) {
          return head + tail;
        }
        return (
          head +
          ' ' +
          this.toSeq()
            .map(this.__toStringMapper)
            .join(', ') +
          ' ' +
          tail
        );
      },

      // ### ES6 Collection methods (ES6 Array and Map)

      concat: function concat() {
        var values = [], len = arguments.length;
        while ( len-- ) values[ len ] = arguments[ len ];

        return reify(this, concatFactory(this, values));
      },

      includes: function includes(searchValue) {
        return this.some(function (value) { return is(value, searchValue); });
      },

      entries: function entries() {
        return this.__iterator(ITERATE_ENTRIES);
      },

      every: function every(predicate, context) {
        assertNotInfinite(this.size);
        var returnValue = true;
        this.__iterate(function (v, k, c) {
          if (!predicate.call(context, v, k, c)) {
            returnValue = false;
            return false;
          }
        });
        return returnValue;
      },

      filter: function filter(predicate, context) {
        return reify(this, filterFactory(this, predicate, context, true));
      },

      find: function find(predicate, context, notSetValue) {
        var entry = this.findEntry(predicate, context);
        return entry ? entry[1] : notSetValue;
      },

      forEach: function forEach(sideEffect, context) {
        assertNotInfinite(this.size);
        return this.__iterate(context ? sideEffect.bind(context) : sideEffect);
      },

      join: function join(separator) {
        assertNotInfinite(this.size);
        separator = separator !== undefined ? '' + separator : ',';
        var joined = '';
        var isFirst = true;
        this.__iterate(function (v) {
          isFirst ? (isFirst = false) : (joined += separator);
          joined += v !== null && v !== undefined ? v.toString() : '';
        });
        return joined;
      },

      keys: function keys() {
        return this.__iterator(ITERATE_KEYS);
      },

      map: function map(mapper, context) {
        return reify(this, mapFactory(this, mapper, context));
      },

      reduce: function reduce$1(reducer, initialReduction, context) {
        return reduce$1(
          this,
          reducer,
          initialReduction,
          context,
          arguments.length < 2,
          false
        );
      },

      reduceRight: function reduceRight(reducer, initialReduction, context) {
        return reduce$1(
          this,
          reducer,
          initialReduction,
          context,
          arguments.length < 2,
          true
        );
      },

      reverse: function reverse() {
        return reify(this, reverseFactory(this, true));
      },

      slice: function slice(begin, end) {
        return reify(this, sliceFactory(this, begin, end, true));
      },

      some: function some(predicate, context) {
        return !this.every(not(predicate), context);
      },

      sort: function sort(comparator) {
        return reify(this, sortFactory(this, comparator));
      },

      values: function values() {
        return this.__iterator(ITERATE_VALUES);
      },

      // ### More sequential methods

      butLast: function butLast() {
        return this.slice(0, -1);
      },

      isEmpty: function isEmpty() {
        return this.size !== undefined ? this.size === 0 : !this.some(function () { return true; });
      },

      count: function count(predicate, context) {
        return ensureSize(
          predicate ? this.toSeq().filter(predicate, context) : this
        );
      },

      countBy: function countBy(grouper, context) {
        return countByFactory(this, grouper, context);
      },

      equals: function equals(other) {
        return deepEqual(this, other);
      },

      entrySeq: function entrySeq() {
        var collection = this;
        if (collection._cache) {
          // We cache as an entries array, so we can just return the cache!
          return new ArraySeq(collection._cache);
        }
        var entriesSequence = collection
          .toSeq()
          .map(entryMapper)
          .toIndexedSeq();
        entriesSequence.fromEntrySeq = function () { return collection.toSeq(); };
        return entriesSequence;
      },

      filterNot: function filterNot(predicate, context) {
        return this.filter(not(predicate), context);
      },

      findEntry: function findEntry(predicate, context, notSetValue) {
        var found = notSetValue;
        this.__iterate(function (v, k, c) {
          if (predicate.call(context, v, k, c)) {
            found = [k, v];
            return false;
          }
        });
        return found;
      },

      findKey: function findKey(predicate, context) {
        var entry = this.findEntry(predicate, context);
        return entry && entry[0];
      },

      findLast: function findLast(predicate, context, notSetValue) {
        return this.toKeyedSeq()
          .reverse()
          .find(predicate, context, notSetValue);
      },

      findLastEntry: function findLastEntry(predicate, context, notSetValue) {
        return this.toKeyedSeq()
          .reverse()
          .findEntry(predicate, context, notSetValue);
      },

      findLastKey: function findLastKey(predicate, context) {
        return this.toKeyedSeq()
          .reverse()
          .findKey(predicate, context);
      },

      first: function first() {
        return this.find(returnTrue);
      },

      flatMap: function flatMap(mapper, context) {
        return reify(this, flatMapFactory(this, mapper, context));
      },

      flatten: function flatten(depth) {
        return reify(this, flattenFactory(this, depth, true));
      },

      fromEntrySeq: function fromEntrySeq() {
        return new FromEntriesSequence(this);
      },

      get: function get(searchKey, notSetValue) {
        return this.find(function (_, key) { return is(key, searchKey); }, undefined, notSetValue);
      },

      getIn: getIn$$1,

      groupBy: function groupBy(grouper, context) {
        return groupByFactory(this, grouper, context);
      },

      has: function has(searchKey) {
        return this.get(searchKey, NOT_SET) !== NOT_SET;
      },

      hasIn: hasIn$$1,

      isSubset: function isSubset(iter) {
        iter = typeof iter.includes === 'function' ? iter : Collection(iter);
        return this.every(function (value) { return iter.includes(value); });
      },

      isSuperset: function isSuperset(iter) {
        iter = typeof iter.isSubset === 'function' ? iter : Collection(iter);
        return iter.isSubset(this);
      },

      keyOf: function keyOf(searchValue) {
        return this.findKey(function (value) { return is(value, searchValue); });
      },

      keySeq: function keySeq() {
        return this.toSeq()
          .map(keyMapper)
          .toIndexedSeq();
      },

      last: function last() {
        return this.toSeq()
          .reverse()
          .first();
      },

      lastKeyOf: function lastKeyOf(searchValue) {
        return this.toKeyedSeq()
          .reverse()
          .keyOf(searchValue);
      },

      max: function max(comparator) {
        return maxFactory(this, comparator);
      },

      maxBy: function maxBy(mapper, comparator) {
        return maxFactory(this, comparator, mapper);
      },

      min: function min(comparator) {
        return maxFactory(
          this,
          comparator ? neg(comparator) : defaultNegComparator
        );
      },

      minBy: function minBy(mapper, comparator) {
        return maxFactory(
          this,
          comparator ? neg(comparator) : defaultNegComparator,
          mapper
        );
      },

      rest: function rest() {
        return this.slice(1);
      },

      skip: function skip(amount) {
        return amount === 0 ? this : this.slice(Math.max(0, amount));
      },

      skipLast: function skipLast(amount) {
        return amount === 0 ? this : this.slice(0, -Math.max(0, amount));
      },

      skipWhile: function skipWhile(predicate, context) {
        return reify(this, skipWhileFactory(this, predicate, context, true));
      },

      skipUntil: function skipUntil(predicate, context) {
        return this.skipWhile(not(predicate), context);
      },

      sortBy: function sortBy(mapper, comparator) {
        return reify(this, sortFactory(this, comparator, mapper));
      },

      take: function take(amount) {
        return this.slice(0, Math.max(0, amount));
      },

      takeLast: function takeLast(amount) {
        return this.slice(-Math.max(0, amount));
      },

      takeWhile: function takeWhile(predicate, context) {
        return reify(this, takeWhileFactory(this, predicate, context));
      },

      takeUntil: function takeUntil(predicate, context) {
        return this.takeWhile(not(predicate), context);
      },

      update: function update(fn) {
        return fn(this);
      },

      valueSeq: function valueSeq() {
        return this.toIndexedSeq();
      },

      // ### Hashable Object

      hashCode: function hashCode() {
        return this.__hash || (this.__hash = hashCollection(this));
      }

      // ### Internal

      // abstract __iterate(fn, reverse)

      // abstract __iterator(type, reverse)
    });

    var CollectionPrototype = Collection.prototype;
    CollectionPrototype[IS_ITERABLE_SENTINEL] = true;
    CollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.values;
    CollectionPrototype.toJSON = CollectionPrototype.toArray;
    CollectionPrototype.__toStringMapper = quoteString;
    CollectionPrototype.inspect = CollectionPrototype.toSource = function() {
      return this.toString();
    };
    CollectionPrototype.chain = CollectionPrototype.flatMap;
    CollectionPrototype.contains = CollectionPrototype.includes;

    mixin(KeyedCollection, {
      // ### More sequential methods

      flip: function flip() {
        return reify(this, flipFactory(this));
      },

      mapEntries: function mapEntries(mapper, context) {
        var this$1 = this;

        var iterations = 0;
        return reify(
          this,
          this.toSeq()
            .map(function (v, k) { return mapper.call(context, [k, v], iterations++, this$1); })
            .fromEntrySeq()
        );
      },

      mapKeys: function mapKeys(mapper, context) {
        var this$1 = this;

        return reify(
          this,
          this.toSeq()
            .flip()
            .map(function (k, v) { return mapper.call(context, k, v, this$1); })
            .flip()
        );
      }
    });

    var KeyedCollectionPrototype = KeyedCollection.prototype;
    KeyedCollectionPrototype[IS_KEYED_SENTINEL] = true;
    KeyedCollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.entries;
    KeyedCollectionPrototype.toJSON = toObject;
    KeyedCollectionPrototype.__toStringMapper = function (v, k) { return quoteString(k) + ': ' + quoteString(v); };

    mixin(IndexedCollection, {
      // ### Conversion to other types

      toKeyedSeq: function toKeyedSeq() {
        return new ToKeyedSequence(this, false);
      },

      // ### ES6 Collection methods (ES6 Array and Map)

      filter: function filter(predicate, context) {
        return reify(this, filterFactory(this, predicate, context, false));
      },

      findIndex: function findIndex(predicate, context) {
        var entry = this.findEntry(predicate, context);
        return entry ? entry[0] : -1;
      },

      indexOf: function indexOf(searchValue) {
        var key = this.keyOf(searchValue);
        return key === undefined ? -1 : key;
      },

      lastIndexOf: function lastIndexOf(searchValue) {
        var key = this.lastKeyOf(searchValue);
        return key === undefined ? -1 : key;
      },

      reverse: function reverse() {
        return reify(this, reverseFactory(this, false));
      },

      slice: function slice(begin, end) {
        return reify(this, sliceFactory(this, begin, end, false));
      },

      splice: function splice(index, removeNum /*, ...values*/) {
        var numArgs = arguments.length;
        removeNum = Math.max(removeNum || 0, 0);
        if (numArgs === 0 || (numArgs === 2 && !removeNum)) {
          return this;
        }
        // If index is negative, it should resolve relative to the size of the
        // collection. However size may be expensive to compute if not cached, so
        // only call count() if the number is in fact negative.
        index = resolveBegin(index, index < 0 ? this.count() : this.size);
        var spliced = this.slice(0, index);
        return reify(
          this,
          numArgs === 1
            ? spliced
            : spliced.concat(arrCopy(arguments, 2), this.slice(index + removeNum))
        );
      },

      // ### More collection methods

      findLastIndex: function findLastIndex(predicate, context) {
        var entry = this.findLastEntry(predicate, context);
        return entry ? entry[0] : -1;
      },

      first: function first() {
        return this.get(0);
      },

      flatten: function flatten(depth) {
        return reify(this, flattenFactory(this, depth, false));
      },

      get: function get(index, notSetValue) {
        index = wrapIndex(this, index);
        return index < 0 ||
          (this.size === Infinity || (this.size !== undefined && index > this.size))
          ? notSetValue
          : this.find(function (_, key) { return key === index; }, undefined, notSetValue);
      },

      has: function has(index) {
        index = wrapIndex(this, index);
        return (
          index >= 0 &&
          (this.size !== undefined
            ? this.size === Infinity || index < this.size
            : this.indexOf(index) !== -1)
        );
      },

      interpose: function interpose(separator) {
        return reify(this, interposeFactory(this, separator));
      },

      interleave: function interleave(/*...collections*/) {
        var collections = [this].concat(arrCopy(arguments));
        var zipped = zipWithFactory(this.toSeq(), IndexedSeq.of, collections);
        var interleaved = zipped.flatten(true);
        if (zipped.size) {
          interleaved.size = zipped.size * collections.length;
        }
        return reify(this, interleaved);
      },

      keySeq: function keySeq() {
        return Range(0, this.size);
      },

      last: function last() {
        return this.get(-1);
      },

      skipWhile: function skipWhile(predicate, context) {
        return reify(this, skipWhileFactory(this, predicate, context, false));
      },

      zip: function zip(/*, ...collections */) {
        var collections = [this].concat(arrCopy(arguments));
        return reify(this, zipWithFactory(this, defaultZipper, collections));
      },

      zipAll: function zipAll(/*, ...collections */) {
        var collections = [this].concat(arrCopy(arguments));
        return reify(this, zipWithFactory(this, defaultZipper, collections, true));
      },

      zipWith: function zipWith(zipper /*, ...collections */) {
        var collections = arrCopy(arguments);
        collections[0] = this;
        return reify(this, zipWithFactory(this, zipper, collections));
      }
    });

    var IndexedCollectionPrototype = IndexedCollection.prototype;
    IndexedCollectionPrototype[IS_INDEXED_SENTINEL] = true;
    IndexedCollectionPrototype[IS_ORDERED_SENTINEL] = true;

    mixin(SetCollection, {
      // ### ES6 Collection methods (ES6 Array and Map)

      get: function get(value, notSetValue) {
        return this.has(value) ? value : notSetValue;
      },

      includes: function includes(value) {
        return this.has(value);
      },

      // ### More sequential methods

      keySeq: function keySeq() {
        return this.valueSeq();
      }
    });

    SetCollection.prototype.has = CollectionPrototype.includes;
    SetCollection.prototype.contains = SetCollection.prototype.includes;

    // Mixin subclasses

    mixin(KeyedSeq, KeyedCollection.prototype);
    mixin(IndexedSeq, IndexedCollection.prototype);
    mixin(SetSeq, SetCollection.prototype);

    // #pragma Helper functions

    function reduce$1(collection, reducer, reduction, context, useFirst, reverse) {
      assertNotInfinite(collection.size);
      collection.__iterate(function (v, k, c) {
        if (useFirst) {
          useFirst = false;
          reduction = v;
        } else {
          reduction = reducer.call(context, reduction, v, k, c);
        }
      }, reverse);
      return reduction;
    }

    function keyMapper(v, k) {
      return k;
    }

    function entryMapper(v, k) {
      return [k, v];
    }

    function not(predicate) {
      return function() {
        return !predicate.apply(this, arguments);
      };
    }

    function neg(predicate) {
      return function() {
        return -predicate.apply(this, arguments);
      };
    }

    function defaultZipper() {
      return arrCopy(arguments);
    }

    function defaultNegComparator(a, b) {
      return a < b ? 1 : a > b ? -1 : 0;
    }

    function hashCollection(collection) {
      if (collection.size === Infinity) {
        return 0;
      }
      var ordered = isOrdered(collection);
      var keyed = isKeyed(collection);
      var h = ordered ? 1 : 0;
      var size = collection.__iterate(
        keyed
          ? ordered
            ? function (v, k) {
                h = (31 * h + hashMerge(hash(v), hash(k))) | 0;
              }
            : function (v, k) {
                h = (h + hashMerge(hash(v), hash(k))) | 0;
              }
          : ordered
            ? function (v) {
                h = (31 * h + hash(v)) | 0;
              }
            : function (v) {
                h = (h + hash(v)) | 0;
              }
      );
      return murmurHashOfSize(size, h);
    }

    function murmurHashOfSize(size, h) {
      h = imul(h, 0xcc9e2d51);
      h = imul((h << 15) | (h >>> -15), 0x1b873593);
      h = imul((h << 13) | (h >>> -13), 5);
      h = ((h + 0xe6546b64) | 0) ^ size;
      h = imul(h ^ (h >>> 16), 0x85ebca6b);
      h = imul(h ^ (h >>> 13), 0xc2b2ae35);
      h = smi(h ^ (h >>> 16));
      return h;
    }

    function hashMerge(a, b) {
      return (a ^ (b + 0x9e3779b9 + (a << 6) + (a >> 2))) | 0; // int
    }

    var OrderedSet = (function (Set$$1) {
      function OrderedSet(value) {
        return value === null || value === undefined
          ? emptyOrderedSet()
          : isOrderedSet(value)
            ? value
            : emptyOrderedSet().withMutations(function (set) {
                var iter = SetCollection(value);
                assertNotInfinite(iter.size);
                iter.forEach(function (v) { return set.add(v); });
              });
      }

      if ( Set$$1 ) OrderedSet.__proto__ = Set$$1;
      OrderedSet.prototype = Object.create( Set$$1 && Set$$1.prototype );
      OrderedSet.prototype.constructor = OrderedSet;

      OrderedSet.of = function of (/*...values*/) {
        return this(arguments);
      };

      OrderedSet.fromKeys = function fromKeys (value) {
        return this(KeyedCollection(value).keySeq());
      };

      OrderedSet.prototype.toString = function toString () {
        return this.__toString('OrderedSet {', '}');
      };

      return OrderedSet;
    }(Set));

    function isOrderedSet(maybeOrderedSet) {
      return isSet(maybeOrderedSet) && isOrdered(maybeOrderedSet);
    }

    OrderedSet.isOrderedSet = isOrderedSet;

    var OrderedSetPrototype = OrderedSet.prototype;
    OrderedSetPrototype[IS_ORDERED_SENTINEL] = true;
    OrderedSetPrototype.zip = IndexedCollectionPrototype.zip;
    OrderedSetPrototype.zipWith = IndexedCollectionPrototype.zipWith;

    OrderedSetPrototype.__empty = emptyOrderedSet;
    OrderedSetPrototype.__make = makeOrderedSet;

    function makeOrderedSet(map, ownerID) {
      var set = Object.create(OrderedSetPrototype);
      set.size = map ? map.size : 0;
      set._map = map;
      set.__ownerID = ownerID;
      return set;
    }

    var EMPTY_ORDERED_SET;
    function emptyOrderedSet() {
      return (
        EMPTY_ORDERED_SET || (EMPTY_ORDERED_SET = makeOrderedSet(emptyOrderedMap()))
      );
    }

    /**
     * Returns a lazy Seq of `value` repeated `times` times. When `times` is
     * undefined, returns an infinite sequence of `value`.
     */
    var Repeat = (function (IndexedSeq$$1) {
      function Repeat(value, times) {
        if (!(this instanceof Repeat)) {
          return new Repeat(value, times);
        }
        this._value = value;
        this.size = times === undefined ? Infinity : Math.max(0, times);
        if (this.size === 0) {
          if (EMPTY_REPEAT) {
            return EMPTY_REPEAT;
          }
          EMPTY_REPEAT = this;
        }
      }

      if ( IndexedSeq$$1 ) Repeat.__proto__ = IndexedSeq$$1;
      Repeat.prototype = Object.create( IndexedSeq$$1 && IndexedSeq$$1.prototype );
      Repeat.prototype.constructor = Repeat;

      Repeat.prototype.toString = function toString () {
        if (this.size === 0) {
          return 'Repeat []';
        }
        return 'Repeat [ ' + this._value + ' ' + this.size + ' times ]';
      };

      Repeat.prototype.get = function get (index, notSetValue) {
        return this.has(index) ? this._value : notSetValue;
      };

      Repeat.prototype.includes = function includes (searchValue) {
        return is(this._value, searchValue);
      };

      Repeat.prototype.slice = function slice (begin, end) {
        var size = this.size;
        return wholeSlice(begin, end, size)
          ? this
          : new Repeat(
              this._value,
              resolveEnd(end, size) - resolveBegin(begin, size)
            );
      };

      Repeat.prototype.reverse = function reverse () {
        return this;
      };

      Repeat.prototype.indexOf = function indexOf (searchValue) {
        if (is(this._value, searchValue)) {
          return 0;
        }
        return -1;
      };

      Repeat.prototype.lastIndexOf = function lastIndexOf (searchValue) {
        if (is(this._value, searchValue)) {
          return this.size;
        }
        return -1;
      };

      Repeat.prototype.__iterate = function __iterate (fn, reverse) {
        var this$1 = this;

        var size = this.size;
        var i = 0;
        while (i !== size) {
          if (fn(this$1._value, reverse ? size - ++i : i++, this$1) === false) {
            break;
          }
        }
        return i;
      };

      Repeat.prototype.__iterator = function __iterator (type, reverse) {
        var this$1 = this;

        var size = this.size;
        var i = 0;
        return new Iterator(
          function () { return i === size
              ? iteratorDone()
              : iteratorValue(type, reverse ? size - ++i : i++, this$1._value); }
        );
      };

      Repeat.prototype.equals = function equals (other) {
        return other instanceof Repeat
          ? is(this._value, other._value)
          : deepEqual(other);
      };

      return Repeat;
    }(IndexedSeq));

    var EMPTY_REPEAT;

    function expandCse(json, valueField, cseField, refField) {
        if (valueField === void 0) { valueField = '_value'; }
        if (cseField === void 0) { cseField = '_cse'; }
        if (refField === void 0) { refField = '_r'; }
        if (typeof json !== 'object')
            return json;
        if (json === null || json[cseField] === void (0))
            return json;
        var cse = json[cseField];
        return expandRec(json[valueField], cse, new Array(cse.length), refField);
    }
    function cse(json, useSharing, valueField, cseField, refField) {
        if (useSharing === void 0) { useSharing = true; }
        if (valueField === void 0) { valueField = '_value'; }
        if (cseField === void 0) { cseField = '_cse'; }
        if (refField === void 0) { refField = '_r'; }
        var cseTemp = [];
        var reused = [];
        if (typeof json === 'object') {
            if (json === null)
                return null;
            var intermediate = useSharing ? cseRecWithSharing(json, JsonTrie.create(), cseTemp, reused, [], refField)
                : cseRec(json, JsonTrie.create(), cseTemp, reused, refField);
            var cse_1 = [];
            var result = reconstitute(intermediate, cseTemp, cse_1, reused, refField);
            return cse_1.length === 0 ? json : (_a = {}, _a[valueField] = result, _a[cseField] = cse_1, _a);
        }
        else {
            return json;
        }
        var _a;
    }
    function expandRec(json, cse, reformed, refField) {
        var type = typeof json;
        if (type === 'object') {
            if (json === null)
                return null;
            var ix = json[refField];
            if (ix !== void (0)) {
                var t = reformed[ix];
                if (t !== void (0))
                    return t;
                return reformed[ix] = expandRec(cse[ix], cse, reformed, refField);
            }
            if (json instanceof Array) {
                var len = json.length;
                var t = new Array(json.length);
                for (var i = 0; i < len; ++i) {
                    t[i] = expandRec(json[i], cse, reformed, refField);
                }
                return t;
            }
            else {
                var keys = Object.keys(json);
                var len = keys.length;
                var t = {};
                for (var i = 0; i < len; ++i) {
                    var k = keys[i];
                    t[k] = expandRec(json[k], cse, reformed, refField);
                }
                return t;
            }
        }
        else {
            return json;
        }
    }
    var JsonTrie = (function () {
        function JsonTrie() {
            this.trie = {};
            this.count = 1;
        }
        JsonTrie.create = function () {
            return new JsonTrie();
        };
        JsonTrie.prototype.insert = function (key) {
            return this.insertRec(key, void (0), this.trie);
        };
        JsonTrie.prototype.insertRec = function (key, val, curr, root) {
            if (root === void 0) { root = true; }
            var type = typeof key;
            if (type === 'object') {
                if (key === null) {
                    if (root)
                        return 'null' in curr ? -curr.null : curr.null = this.count++;
                    var node = curr.null;
                    if (node === void (0))
                        curr.null = node = val;
                    return node;
                }
                else if (key instanceof Array) {
                    var node = curr.array;
                    if (node === void (0))
                        curr.array = node = {};
                    var len = key.length;
                    for (var i = 0; i < len; ++i) {
                        node = this.insertRec(key[i], {}, node, false);
                    }
                    if (root)
                        return 'empty' in node ? -node.empty : node.empty = this.count++;
                    var node2 = node.empty;
                    if (node2 === void (0))
                        node.empty = node2 = val;
                    return node2;
                }
                else {
                    var node = curr.object;
                    if (node === void (0))
                        curr.object = node = {};
                    var keys = Object.keys(key).sort();
                    var len = keys.length;
                    for (var i = 0; i < len; ++i) {
                        var k = keys[i];
                        var node2_1 = node.more;
                        if (node2_1 === void (0))
                            node.more = node2_1 = {};
                        var node3 = node2_1[k];
                        if (node3 === void (0))
                            node2_1[k] = node3 = {};
                        node = this.insertRec(key[k], {}, node3, false);
                    }
                    if (root)
                        return 'empty' in node ? -node.empty : node.empty = this.count++;
                    var node2 = node.empty;
                    if (node2 === void (0))
                        node.empty = node2 = val;
                    return node2;
                }
            }
            else if (type === 'undefined') {
                if (root)
                    return 'undefined' in curr ? -curr.undefined : curr.undefined = this.count++;
                var node = curr.undefined;
                if (node === void (0))
                    curr.undefined = node = val;
                return node;
            }
            else {
                var node = curr[type];
                if (node === void (0))
                    curr[type] = node = {};
                if (root)
                    return key in node ? -node[key] : node[key] = this.count++;
                var node2 = node[key];
                if (node2 === void (0))
                    node[key] = node2 = val;
                return node2;
            }
        };
        return JsonTrie;
    }());
    function cseRecWithSharing(key, trie, cse, reused, seen, refField) {
        var type = typeof key;
        if (type === 'object') {
            if (key === null)
                return null;
            var seenLen = seen.length;
            for (var i = 0; i < seenLen; ++i) {
                var p = seen[i];
                if (key === p[0]) {
                    var r = p[1];
                    reused[r[refField]] = true;
                    return r;
                }
            }
            if (key instanceof Array) {
                var len = key.length;
                var result = new Array(len);
                for (var i = 0; i < len; ++i) {
                    result[i] = cseRecWithSharing(key[i], trie, cse, reused, seen, refField);
                }
                var ix = trie.insert(result);
                if (ix < 0) {
                    reused[-ix - 1] = true;
                    return _a = {}, _a[refField] = -ix - 1, _a;
                }
                else {
                    cse[ix - 1] = result;
                    var r = (_b = {}, _b[refField] = ix - 1, _b);
                    seen.push([key, r]);
                    return r;
                }
            }
            else {
                var keys = Object.keys(key);
                var len = keys.length;
                var result = {};
                for (var i = 0; i < len; ++i) {
                    var k = keys[i];
                    result[k] = cseRecWithSharing(key[k], trie, cse, reused, seen, refField);
                }
                var ix = trie.insert(result);
                if (ix < 0) {
                    reused[-ix - 1] = true;
                    return _c = {}, _c[refField] = -ix - 1, _c;
                }
                else {
                    cse[ix - 1] = result;
                    var r = (_d = {}, _d[refField] = ix - 1, _d);
                    seen.push([key, r]);
                    return r;
                }
            }
        }
        else {
            return key;
        }
        var _a, _b, _c, _d;
    }
    function cseRec(key, trie, cse, reused, refField) {
        var type = typeof key;
        if (type === 'object') {
            if (key === null)
                return null;
            if (key instanceof Array) {
                var len = key.length;
                var result = new Array(len);
                for (var i = 0; i < len; ++i) {
                    result[i] = cseRec(key[i], trie, cse, reused, refField);
                }
                var ix = trie.insert(result);
                if (ix < 0) {
                    reused[-ix - 1] = true;
                    return _a = {}, _a[refField] = -ix - 1, _a;
                }
                else {
                    cse[ix - 1] = result;
                    var r = (_b = {}, _b[refField] = ix - 1, _b);
                    return r;
                }
            }
            else {
                var keys = Object.keys(key);
                var len = keys.length;
                var result = {};
                for (var i = 0; i < len; ++i) {
                    var k = keys[i];
                    result[k] = cseRec(key[k], trie, cse, reused, refField);
                }
                var ix = trie.insert(result);
                if (ix < 0) {
                    reused[-ix - 1] = true;
                    return _c = {}, _c[refField] = -ix - 1, _c;
                }
                else {
                    cse[ix - 1] = result;
                    var r = (_d = {}, _d[refField] = ix - 1, _d);
                    return r;
                }
            }
        }
        else {
            return key;
        }
        var _a, _b, _c, _d;
    }
    function reconstitute(intermediate, cseTemp, cse, reused, refField) {
        var type = typeof intermediate;
        if (type === 'object') {
            if (intermediate === null)
                return null;
            var ix = intermediate[refField];
            if (reused[ix]) {
                var t = cseTemp[ix];
                if (typeof t === 'number') {
                    return _a = {}, _a[refField] = t, _a;
                }
                else {
                    var newIx = cse.length;
                    cse.push(t);
                    cseTemp[ix] = newIx;
                    if (t instanceof Array) {
                        var len = t.length;
                        for (var i = 0; i < len; ++i) {
                            t[i] = reconstitute(t[i], cseTemp, cse, reused, refField);
                        }
                    }
                    else {
                        var keys = Object.keys(t);
                        var len = keys.length;
                        for (var i = 0; i < len; ++i) {
                            var k = keys[i];
                            t[k] = reconstitute(t[k], cseTemp, cse, reused, refField);
                        }
                    }
                    return _b = {}, _b[refField] = newIx, _b;
                }
            }
            else {
                var tmp = cseTemp[ix];
                if (tmp instanceof Array) {
                    var len = tmp.length;
                    for (var i = 0; i < len; ++i) {
                        tmp[i] = reconstitute(tmp[i], cseTemp, cse, reused, refField);
                    }
                    return tmp;
                }
                else {
                    var tmp_1 = cseTemp[ix];
                    var keys = Object.keys(tmp_1);
                    var len = keys.length;
                    for (var i = 0; i < len; ++i) {
                        var k = keys[i];
                        tmp_1[k] = reconstitute(tmp_1[k], cseTemp, cse, reused, refField);
                    }
                    return tmp_1;
                }
            }
        }
        else {
            return intermediate;
        }
        var _a, _b;
    }

    // Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
    // This work is free. You can redistribute it and/or modify it
    // under the terms of the WTFPL, Version 2
    // For more information see LICENSE.txt or http://www.wtfpl.net/
    //
    // For more information, the home page:
    // http://pieroxy.net/blog/pages/lz-string/testing.html
    //
    // LZ-based compression algorithm, version 1.4.4

    // private property
    var f = String.fromCharCode;
    var keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
    var baseReverseDic = {};

    function getBaseValue(alphabet, character) {
      if (!baseReverseDic[alphabet]) {
        baseReverseDic[alphabet] = {};
        for (var i=0 ; i<alphabet.length ; i++) {
          baseReverseDic[alphabet][alphabet.charAt(i)] = i;
        }
      }
      return baseReverseDic[alphabet][character];
    }

      //compress into a string that is already URI encoded
    function compressToEncodedURIComponent(input) {
        if (input == null) return "";
        return _compress(input, 6, function(a){return keyStrUriSafe.charAt(a);});
      }

      //decompress from an output of compressToEncodedURIComponent
    function decompressFromEncodedURIComponent(input) {
        if (input == null) return "";
        if (input == "") return null;
        input = input.replace(/ /g, "+");
        return _decompress(input.length, 32, function(index) { return getBaseValue(keyStrUriSafe, input.charAt(index)); });
      }

    function _compress(uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) return "";
        var i, value,
            context_dictionary= {},
            context_dictionaryToCreate= {},
            context_c="",
            context_wc="",
            context_w="",
            context_enlargeIn= 2, // Compensate for the first entry which should not count
            context_dictSize= 3,
            context_numBits= 2,
            context_data=[],
            context_data_val=0,
            context_data_position=0,
            ii;

        for (ii = 0; ii < uncompressed.length; ii += 1) {
          context_c = uncompressed.charAt(ii);
          if (!Object.prototype.hasOwnProperty.call(context_dictionary,context_c)) {
            context_dictionary[context_c] = context_dictSize++;
            context_dictionaryToCreate[context_c] = true;
          }

          context_wc = context_w + context_c;
          if (Object.prototype.hasOwnProperty.call(context_dictionary,context_wc)) {
            context_w = context_wc;
          } else {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
              if (context_w.charCodeAt(0)<256) {
                for (i=0 ; i<context_numBits ; i++) {
                  context_data_val = (context_data_val << 1);
                  if (context_data_position == bitsPerChar-1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                }
                value = context_w.charCodeAt(0);
                for (i=0 ; i<8 ; i++) {
                  context_data_val = (context_data_val << 1) | (value&1);
                  if (context_data_position == bitsPerChar-1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              } else {
                value = 1;
                for (i=0 ; i<context_numBits ; i++) {
                  context_data_val = (context_data_val << 1) | value;
                  if (context_data_position ==bitsPerChar-1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = 0;
                }
                value = context_w.charCodeAt(0);
                for (i=0 ; i<16 ; i++) {
                  context_data_val = (context_data_val << 1) | (value&1);
                  if (context_data_position == bitsPerChar-1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              delete context_dictionaryToCreate[context_w];
            } else {
              value = context_dictionary[context_w];
              for (i=0 ; i<context_numBits ; i++) {
                context_data_val = (context_data_val << 1) | (value&1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }


            }
            context_enlargeIn--;
            if (context_enlargeIn == 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
            // Add wc to the dictionary.
            context_dictionary[context_wc] = context_dictSize++;
            context_w = String(context_c);
          }
        }

        // Output the code for w.
        if (context_w !== "") {
          if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
            if (context_w.charCodeAt(0)<256) {
              for (i=0 ; i<context_numBits ; i++) {
                context_data_val = (context_data_val << 1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
              }
              value = context_w.charCodeAt(0);
              for (i=0 ; i<8 ; i++) {
                context_data_val = (context_data_val << 1) | (value&1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            } else {
              value = 1;
              for (i=0 ; i<context_numBits ; i++) {
                context_data_val = (context_data_val << 1) | value;
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = 0;
              }
              value = context_w.charCodeAt(0);
              for (i=0 ; i<16 ; i++) {
                context_data_val = (context_data_val << 1) | (value&1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn == 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
          } else {
            value = context_dictionary[context_w];
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }


          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
        }

        // Mark the end of the stream
        value = 2;
        for (i=0 ; i<context_numBits ; i++) {
          context_data_val = (context_data_val << 1) | (value&1);
          if (context_data_position == bitsPerChar-1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }

        // Flush the last char
        while (true) {
          context_data_val = (context_data_val << 1);
          if (context_data_position == bitsPerChar-1) {
            context_data.push(getCharFromInt(context_data_val));
            break;
          }
          else context_data_position++;
        }
        return context_data.join('');
      }

    function _decompress(length, resetValue, getNextValue) {
        var dictionary = [],
            next,
            enlargeIn = 4,
            dictSize = 4,
            numBits = 3,
            entry = "",
            result = [],
            i,
            w,
            bits, resb, maxpower, power,
            c,
            data = {val:getNextValue(0), position:resetValue, index:1};

        for (i = 0; i < 3; i += 1) {
          dictionary[i] = i;
        }

        bits = 0;
        maxpower = Math.pow(2,2);
        power=1;
        while (power!=maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb>0 ? 1 : 0) * power;
          power <<= 1;
        }

        switch (next = bits) {
          case 0:
              bits = 0;
              maxpower = Math.pow(2,8);
              power=1;
              while (power!=maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb>0 ? 1 : 0) * power;
                power <<= 1;
              }
            c = f(bits);
            break;
          case 1:
              bits = 0;
              maxpower = Math.pow(2,16);
              power=1;
              while (power!=maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb>0 ? 1 : 0) * power;
                power <<= 1;
              }
            c = f(bits);
            break;
          case 2:
            return "";
        }
        dictionary[3] = c;
        w = c;
        result.push(c);
        while (true) {
          if (data.index > length) {
            return "";
          }

          bits = 0;
          maxpower = Math.pow(2,numBits);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }

          switch (c = bits) {
            case 0:
              bits = 0;
              maxpower = Math.pow(2,8);
              power=1;
              while (power!=maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb>0 ? 1 : 0) * power;
                power <<= 1;
              }

              dictionary[dictSize++] = f(bits);
              c = dictSize-1;
              enlargeIn--;
              break;
            case 1:
              bits = 0;
              maxpower = Math.pow(2,16);
              power=1;
              while (power!=maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb>0 ? 1 : 0) * power;
                power <<= 1;
              }
              dictionary[dictSize++] = f(bits);
              c = dictSize-1;
              enlargeIn--;
              break;
            case 2:
              return result.join('');
          }

          if (enlargeIn == 0) {
            enlargeIn = Math.pow(2, numBits);
            numBits++;
          }

          if (dictionary[c]) {
            entry = dictionary[c];
          } else {
            if (c === dictSize) {
              entry = w + w.charAt(0);
            } else {
              return null;
            }
          }
          result.push(entry);

          // Add w+entry[0] to the dictionary.
          dictionary[dictSize++] = w + entry.charAt(0);
          enlargeIn--;

          w = entry;

          if (enlargeIn == 0) {
            enlargeIn = Math.pow(2, numBits);
            numBits++;
          }

        }
      }

    function nullMap(xs, f) {
        var len = xs.length;
        var result = new Array(len);
        for (var i = 0; i < len; ++i) {
            var y = f(xs[i]);
            if (y === null)
                return null;
            result[i] = y;
        }
        return result;
    }
    var BOT_SYMBOL = '⊥';
    var TOP_SYMBOL = '⊤';
    var NOT_SYMBOL = '¬';
    var AND_SYMBOL = '∧';
    var OR_SYMBOL = '∨';
    var IMP_SYMBOL = '→';
    var FORALL_SYMBOL = '∀';
    var EXISTS_SYMBOL = '∃';
    var connectiveToLaTeX = (_a = {}, _a[BOT_SYMBOL] = '\\bot{}', _a[TOP_SYMBOL] = '\\top{}', _a[NOT_SYMBOL] = '\\neg{}', _a[AND_SYMBOL] = '\\land{}', _a[OR_SYMBOL] = '\\lor{}', _a[IMP_SYMBOL] = '\\to{}', _a[FORALL_SYMBOL] = '\\forall{}', _a[EXISTS_SYMBOL] = '\\exists{}', _a);
    var Variable = (function () {
        function Variable(variable) {
            this.variable = variable;
        }
        Variable.prototype.match = function (variableCase, opCase) {
            return variableCase(this.variable);
        };
        Variable.prototype.toJson = function () {
            return this.variable.toJson();
        };
        Variable.prototype.toDisplayString = function (topLevel) { return this.variable.toDisplayString(true); };
        Variable.prototype.toLaTeX = function (topLevel) { return this.variable.toLaTeX(true); };
        Variable.prototype.freeVariables = function () {
            return Set.of(this.variable);
        };
        Variable.prototype.alphaRename = function (oldVar, newVar) {
            if (this.variable.equals(oldVar))
                return new Variable(newVar);
            return this;
        };
        Variable.prototype.substitute = function (oldVar, term) {
            if (!this.variable.equals(oldVar))
                return this;
            return term;
        };
        Variable.prototype.equals = function (other) {
            var _this = this;
            return other.match(function (v) { return _this.variable.equals(v); }, function (_) { return false; });
        };
        return Variable;
    }());
    var Operator = (function () {
        function Operator(operator) {
            var ts = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                ts[_i - 1] = arguments[_i];
            }
            this.operator = operator;
            this.terms = ts;
        }
        Operator.prototype.match = function (variableCase, opCase) {
            return opCase.apply(void 0, [this.operator].concat(this.terms));
        };
        Operator.prototype.toJson = function () {
            return [this.operator].concat(this.terms.map(function (t) { return t.toJson(); }));
        };
        Operator.prototype.toDisplayString = function (topLevel) { return this.operator + '(' + this.terms.map(function (t) { return t.toDisplayString(true); }).join(', ') + ')'; };
        Operator.prototype.toLaTeX = function (topLevel) { return '\\mathsf{' + this.operator + '}(' + this.terms.map(function (t) { return t.toLaTeX(true); }).join(', ') + ')'; };
        Operator.prototype.freeVariables = function () {
            return Set.union(this.terms.map(function (t) { return t.freeVariables(); }));
        };
        Operator.prototype.alphaRename = function (oldVar, newVar) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new (Operator.bind.apply(Operator, [void 0, this.operator].concat(this.terms.map(function (t) { return t.alphaRename(oldVar, newVar); }))))();
        };
        Operator.prototype.substitute = function (oldVar, term) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new (Operator.bind.apply(Operator, [void 0, this.operator].concat(this.terms.map(function (t) { return t.substitute(oldVar, term); }))))();
        };
        Operator.prototype.equals = function (other) {
            var _this = this;
            return other.match(function (v) { return false; }, function (o) {
                var ts = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    ts[_i - 1] = arguments[_i];
                }
                return o === _this.operator
                    && _this.terms.length === ts.length
                    && ts.every(function (t, i) { return t.equals(_this.terms[i]); });
            });
        };
        return Operator;
    }());
    function varFromJson(json) {
        if (typeof json !== 'string')
            return null;
        var components = json.split('.');
        if (components.length !== 1 && components.length !== 2)
            return null;
        try {
            return new Var(components[0], components[1] === void (0) ? -1 : parseInt(components[1], 10));
        }
        catch (SyntaxError) {
            return null;
        }
    }
    function termFromJson(json) {
        if (typeof json === 'string') {
            var v = varFromJson(json);
            if (v === null)
                return null;
            return new Variable(v);
        }
        if (typeof json !== 'object' || json === null || !(json instanceof Array) || json.length < 1)
            return null;
        var terms = nullMap(json.slice(1), termFromJson);
        if (terms === null)
            return null;
        return new (Operator.bind.apply(Operator, [void 0, json[0]].concat(terms)))();
    }
    var Predicate = (function () {
        function Predicate(predicate) {
            var ts = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                ts[_i - 1] = arguments[_i];
            }
            this.predicate = predicate;
            this.terms = ts;
        }
        Predicate.prototype.match = function (predicateCase, nullaryCase, unaryCase, binaryCase, quantifierCase) {
            return predicateCase.apply(void 0, [this.predicate].concat(this.terms));
        };
        Predicate.prototype.toJson = function () {
            return [this.predicate].concat(this.terms.map(function (t) { return t.toJson(); }));
        };
        Predicate.prototype.toDisplayString = function (topLevel) {
            return this.terms.length === 0 ? '' + this.predicate : this.predicate + '(' + this.terms.map(function (t) { return t.toDisplayString(true); }).join(', ') + ')';
        };
        Predicate.prototype.toLaTeX = function (topLevel) {
            return this.terms.length === 0 ? '\\mathrm{' + this.predicate + '}' : '\\mathrm{' + this.predicate + '}(' + this.terms.map(function (t) { return t.toLaTeX(true); }).join(', ') + ')';
        };
        Predicate.prototype.freeVariables = function () {
            return Set.union(this.terms.map(function (t) { return t.freeVariables(); }));
        };
        Predicate.prototype.alphaRename = function (oldVar, newVar) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new (Predicate.bind.apply(Predicate, [void 0, this.predicate].concat(this.terms.map(function (t) { return t.alphaRename(oldVar, newVar); }))))();
        };
        Predicate.prototype.substitute = function (oldVar, term) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new (Predicate.bind.apply(Predicate, [void 0, this.predicate].concat(this.terms.map(function (t) { return t.substitute(oldVar, term); }))))();
        };
        Predicate.prototype.matches = function (predicate, terms) {
            var _this = this;
            return this.predicate === predicate
                && this.terms.length === terms.length
                && terms.every(function (t, i) { return t.equals(_this.terms[i]); });
        };
        return Predicate;
    }());
    var NullaryConnective = (function () {
        function NullaryConnective(connective) {
            this.connective = connective;
        }
        NullaryConnective.prototype.match = function (predicateCase, nullaryCase, unaryCase, binaryCase, quantifierCase) {
            return nullaryCase(this.connective);
        };
        NullaryConnective.prototype.toJson = function () {
            return this.connective;
        };
        NullaryConnective.prototype.toDisplayString = function (topLevel) { return '' + this.connective; };
        NullaryConnective.prototype.toLaTeX = function (topLevel) { return connectiveToLaTeX['' + this.connective]; };
        NullaryConnective.prototype.freeVariables = function () {
            return Set();
        };
        NullaryConnective.prototype.alphaRename = function (oldVar, newVar) {
            return this;
        };
        NullaryConnective.prototype.substitute = function (oldVar, term) { return this; };
        NullaryConnective.prototype.matches = function (predicate, terms) { return false; };
        return NullaryConnective;
    }());
    var UnaryConnective = (function () {
        function UnaryConnective(connective, formula) {
            this.connective = connective;
            this.formula = formula;
        }
        UnaryConnective.prototype.match = function (predicateCase, nullaryCase, unaryCase, binaryCase, quantifierCase) {
            return unaryCase(this.connective, this.formula);
        };
        UnaryConnective.prototype.toJson = function () {
            return { c: this.connective, r: this.formula.toJson() };
        };
        UnaryConnective.prototype.toDisplayString = function (topLevel) {
            if (topLevel) {
                return this.connective + this.formula.toDisplayString(false);
            }
            else {
                return '(' + this.connective + this.formula.toDisplayString(false) + ')';
            }
        };
        UnaryConnective.prototype.toLaTeX = function (topLevel) {
            if (topLevel) {
                return connectiveToLaTeX['' + this.connective] + this.formula.toLaTeX(false);
            }
            else {
                return '(' + connectiveToLaTeX['' + this.connective] + this.formula.toLaTeX(false) + ')';
            }
        };
        UnaryConnective.prototype.freeVariables = function () {
            return this.formula.freeVariables();
        };
        UnaryConnective.prototype.alphaRename = function (oldVar, newVar) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new UnaryConnective(this.connective, this.formula.alphaRename(oldVar, newVar));
        };
        UnaryConnective.prototype.substitute = function (oldVar, term) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new UnaryConnective(this.connective, this.formula.substitute(oldVar, term));
        };
        UnaryConnective.prototype.matches = function (predicate, terms) { return false; };
        return UnaryConnective;
    }());
    var BinaryConnective = (function () {
        function BinaryConnective(leftFormula, connective, rightFormula) {
            this.leftFormula = leftFormula;
            this.connective = connective;
            this.rightFormula = rightFormula;
        }
        BinaryConnective.prototype.match = function (predicateCase, nullaryCase, unaryCase, binaryCase, quantifierCase) {
            return binaryCase(this.leftFormula, this.connective, this.rightFormula);
        };
        BinaryConnective.prototype.toJson = function () {
            return { c: this.connective, l: this.leftFormula.toJson(), r: this.rightFormula.toJson() };
        };
        BinaryConnective.prototype.toDisplayString = function (topLevel) {
            if (topLevel) {
                return this.leftFormula.toDisplayString(false) + this.connective + this.rightFormula.toDisplayString(false);
            }
            else {
                return '(' + this.leftFormula.toDisplayString(false) + this.connective + this.rightFormula.toDisplayString(false) + ')';
            }
        };
        BinaryConnective.prototype.toLaTeX = function (topLevel) {
            if (topLevel) {
                return this.leftFormula.toLaTeX(false) + connectiveToLaTeX['' + this.connective] + this.rightFormula.toLaTeX(false);
            }
            else {
                return '(' + this.leftFormula.toLaTeX(false) + connectiveToLaTeX['' + this.connective] + this.rightFormula.toLaTeX(false) + ')';
            }
        };
        BinaryConnective.prototype.freeVariables = function () {
            return this.leftFormula.freeVariables().union(this.rightFormula.freeVariables());
        };
        BinaryConnective.prototype.alphaRename = function (oldVar, newVar) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new BinaryConnective(this.leftFormula.alphaRename(oldVar, newVar), this.connective, this.rightFormula.alphaRename(oldVar, newVar));
        };
        BinaryConnective.prototype.substitute = function (oldVar, term) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new BinaryConnective(this.leftFormula.substitute(oldVar, term), this.connective, this.rightFormula.substitute(oldVar, term));
        };
        BinaryConnective.prototype.matches = function (predicate, terms) { return false; };
        return BinaryConnective;
    }());
    var Quantifier = (function () {
        function Quantifier(quantifier, variable, formula) {
            this.quantifier = quantifier;
            this.variable = variable;
            this.formula = formula;
        }
        Quantifier.prototype.match = function (predicateCase, nullaryCase, unaryCase, binaryCase, quantifierCase) {
            return quantifierCase(this.quantifier, this.variable, this.formula);
        };
        Quantifier.prototype.toJson = function () {
            return { q: this.quantifier, v: this.variable.toJson(), f: this.formula.toJson() };
        };
        Quantifier.prototype.toDisplayString = function (topLevel) {
            if (topLevel) {
                return this.quantifier + this.variable.toDisplayString(false) + '.' + this.formula.toDisplayString(false);
            }
            else {
                return '(' + this.quantifier + this.variable.toDisplayString(false) + '.' + this.formula.toDisplayString(true) + ')';
            }
        };
        Quantifier.prototype.toLaTeX = function (topLevel) {
            if (topLevel) {
                return connectiveToLaTeX['' + this.quantifier] + this.variable.toLaTeX(false) + '.' + this.formula.toLaTeX(false);
            }
            else {
                return '(' + connectiveToLaTeX['' + this.quantifier] + this.variable.toLaTeX(false) + '.' + this.formula.toLaTeX(true) + ')';
            }
        };
        Quantifier.prototype.freeVariables = function () {
            return this.formula.freeVariables().delete(this.variable);
        };
        Quantifier.prototype.alphaRename = function (oldVar, newVar) {
            if (!this.freeVariables().has(oldVar))
                return this;
            return new Quantifier(this.quantifier, this.variable, this.formula.alphaRename(oldVar, newVar));
        };
        Quantifier.prototype.substitute = function (oldVar, term) {
            if (!this.freeVariables().has(oldVar))
                return this;
            var variableContext = term.freeVariables();
            if (variableContext.has(this.variable)) {
                var fresh = this.variable.freshen(variableContext);
                return new Quantifier(this.quantifier, fresh, this.formula.alphaRename(this.variable, fresh).substitute(oldVar, term));
            }
            else {
                return new Quantifier(this.quantifier, this.variable, this.formula.substitute(oldVar, term));
            }
        };
        Quantifier.prototype.matches = function (predicate, terms) { return false; };
        return Quantifier;
    }());
    function formulaFromJson(json) {
        if (typeof json === 'string')
            return new NullaryConnective(json);
        if (typeof json !== 'object' || json === null)
            return null;
        if (json instanceof Array) {
            if (json.length < 1)
                return null;
            var terms = nullMap(json.slice(1), termFromJson);
            if (terms === null)
                return null;
            return new (Predicate.bind.apply(Predicate, [void 0, json[0]].concat(terms)))();
        }
        if ('q' in json) {
            var q = json.q;
            if (typeof q !== 'string')
                return null;
            var v = varFromJson(json.v);
            if (v === null)
                return null;
            var f = formulaFromJson(json.f);
            if (f === null)
                return null;
            return new Quantifier(q, v, f);
        }
        else if ('l' in json) {
            var c = json.c;
            if (typeof c !== 'string')
                return null;
            var r = formulaFromJson(json.r);
            if (r === null)
                return null;
            var l = formulaFromJson(json.l);
            if (l === null)
                return null;
            return new BinaryConnective(l, c, r);
        }
        else {
            var c = json.c;
            if (typeof c !== 'string')
                return null;
            var r = formulaFromJson(json.r);
            if (r === null)
                return null;
            return new UnaryConnective(c, r);
        }
    }
    var Goal = (function () {
        function Goal(premises, consequences) {
            this.premises = premises;
            this.consequences = consequences;
        }
        Goal.prototype.match = function (f) {
            return f(this.premises, this.consequences);
        };
        Goal.prototype.freeVariables = function () {
            return Set.union(this.premises.map(function (p) { return p.freeVariables(); }).concat(this.consequences.map(function (c) { return c.freeVariables(); })));
        };
        Goal.prototype.toDisplayString = function (topLevel) {
            return this.premises.map(function (p) { return p.toDisplayString(true); }).join(', ') + ' ⊢ ' + this.consequences.map(function (c) { return c.toDisplayString(true); }).join(', ');
        };
        Goal.prototype.toLaTeX = function (topLevel) {
            return this.premises.map(function (p) { return p.toLaTeX(true); }).join(', ') + '\\vdash ' + this.consequences.map(function (c) { return c.toLaTeX(true); }).join(', ');
        };
        Goal.prototype.toJson = function () {
            return [this.premises.map(function (p) { return p.toJson(); }), this.consequences.map(function (c) { return c.toJson(); })];
        };
        return Goal;
    }());
    function goalFromJson(json) {
        if (typeof json !== 'object' || json === null || !(json instanceof Array) || json.length !== 2)
            return null;
        if (!(json[0] instanceof Array && json[1] instanceof Array))
            return null;
        var premises = nullMap(json[0], formulaFromJson);
        if (premises === null)
            return null;
        var consequences = nullMap(json[1], formulaFromJson);
        if (consequences === null)
            return null;
        return new Goal(premises, consequences);
    }
    var Lexer = (function () {
        function Lexer(inputString) {
            this.inputString = inputString;
            this.position = 0;
            this.buffer = null;
            this.next();
        }
        Lexer.prototype.peek = function () {
            return this.buffer;
        };
        Lexer.prototype.next = function () {
            var result = this.innerNext();
            this.buffer = result === 'done' || result === 'error' ? null : result;
            return result;
        };
        Lexer.prototype.innerNext = function () {
            var nameRE = Lexer.lexTable[Lexer.NAME_TOKEN];
            var input$$1 = this.inputString.slice(this.position);
            nameRE.lastIndex = 0;
            var nameResult = nameRE.exec(input$$1);
            if (nameResult !== null) {
                this.position += nameRE.lastIndex;
                var s = nameResult[1];
                if (/^forall$/i.test(s))
                    return [Lexer.FORALL_TOKEN, s];
                if (/^exists$/i.test(s))
                    return [Lexer.EXISTS_TOKEN, s];
                if (/^true/i.test(s))
                    return [Lexer.TOP_TOKEN, s];
                if (/^false/i.test(s))
                    return [Lexer.BOT_TOKEN, s];
                return [Lexer.NAME_TOKEN, s];
            }
            else {
                for (var reName in Lexer.lexTable) {
                    if (reName === Lexer.NAME_TOKEN)
                        continue;
                    var re = Lexer.lexTable[reName];
                    re.lastIndex = 0;
                    var result = re.exec(input$$1);
                    if (result === null)
                        continue;
                    this.position += re.lastIndex;
                    return [reName, result[1]];
                }
                Lexer.spaceRegExp.lastIndex = 0;
                return Lexer.spaceRegExp.test(input$$1) ? 'done' : 'error';
            }
        };
        Lexer.NAME_TOKEN = 'NAME';
        Lexer.LPAREN_TOKEN = 'LPAREN';
        Lexer.RPAREN_TOKEN = 'RPAREN';
        Lexer.COMMA_TOKEN = 'COMMA';
        Lexer.PERIOD_TOKEN = 'PERIOD';
        Lexer.TURNSTILE_TOKEN = 'TURNSTILE';
        Lexer.BOT_TOKEN = 'BOTTOM';
        Lexer.TOP_TOKEN = 'TOP';
        Lexer.NOT_TOKEN = 'NOT';
        Lexer.AND_TOKEN = 'AND';
        Lexer.OR_TOKEN = 'OR';
        Lexer.IMP_TOKEN = 'IMPLIES';
        Lexer.FORALL_TOKEN = 'FORALL';
        Lexer.EXISTS_TOKEN = 'EXISTS';
        Lexer.lexTable = (_b = {}, _b[Lexer.NAME_TOKEN] = /^\s*([a-zA-Z][a-zA-Z0-9]*(_[0-9]+)?)/giu, _b[Lexer.LPAREN_TOKEN] = /^\s*(\()/giu, _b[Lexer.RPAREN_TOKEN] = /^\s*(\))/giu, _b[Lexer.COMMA_TOKEN] = /^\s*(,)/giu, _b[Lexer.PERIOD_TOKEN] = /^\s*(\.)/giu, _b[Lexer.TURNSTILE_TOKEN] = /^\s*(\|-|⊢)/giu, _b[Lexer.BOT_TOKEN] = /^\s*(false|_\|_|⊥)/giu, _b[Lexer.TOP_TOKEN] = /^\s*(true|⊤)/giu, _b[Lexer.NOT_TOKEN] = /^\s*(~|¬)/giu, _b[Lexer.AND_TOKEN] = /^\s*(\/\\|∧)/giu, _b[Lexer.OR_TOKEN] = /^\s*(\\\/|∨)/giu, _b[Lexer.IMP_TOKEN] = /^\s*(->|=>|⇒|→)/giu, _b[Lexer.FORALL_TOKEN] = /^\s*(forall|∀)/giu, _b[Lexer.EXISTS_TOKEN] = /^\s*(exists|∃)/giu, _b);
        Lexer.spaceRegExp = /^\s*$/gu;
        return Lexer;
    }());
    function parseVariable(v) {
        var components = v.split('_');
        if (components.length !== 1 && components.length !== 2)
            return null;
        try {
            return new Var(components[0], components[1] === void (0) ? -1 : parseInt(components[1], 10));
        }
        catch (SyntaxError) {
            return null;
        }
    }
    function parseTerm(lexer) {
        var nameToken = lexer.peek();
        if (nameToken === null || nameToken[0] !== Lexer.NAME_TOKEN)
            return null;
        var lparenToken = lexer.next();
        if (lparenToken === 'error')
            return null;
        if (lparenToken === 'done' || lparenToken[0] !== Lexer.LPAREN_TOKEN) {
            var v = parseVariable(nameToken[1]);
            if (v === null)
                return null;
            return new Variable(v);
        }
        lexer.next();
        var terms = parseTermList(lexer);
        if (terms === null)
            return null;
        var rparenToken = lexer.peek();
        if (rparenToken === null || rparenToken[0] !== Lexer.RPAREN_TOKEN)
            return null;
        lexer.next();
        return new (Operator.bind.apply(Operator, [void 0, nameToken[1]].concat(terms)))();
    }
    function parseTermList(lexer) {
        var firstTerm = parseTerm(lexer);
        if (firstTerm === null)
            return [];
        var terms = [firstTerm];
        while (true) {
            var commaToken = lexer.peek();
            if (commaToken === null || commaToken[0] !== Lexer.COMMA_TOKEN)
                return terms;
            lexer.next();
            var nextTerm = parseTerm(lexer);
            if (nextTerm === null)
                return null;
            terms.push(nextTerm);
        }
    }
    function termFromString(s) {
        var lexer = new Lexer(s);
        var term = parseTerm(lexer);
        if (lexer.peek() !== null)
            return null;
        return term;
    }
    var nullaryConnectives = (_c = {}, _c[Lexer.TOP_TOKEN] = TOP_SYMBOL, _c[Lexer.BOT_TOKEN] = BOT_SYMBOL, _c);
    var unaryConnectives = (_d = {}, _d[Lexer.NOT_TOKEN] = NOT_SYMBOL, _d);
    var binaryConnectives = (_e = {}, _e[Lexer.AND_TOKEN] = AND_SYMBOL, _e[Lexer.OR_TOKEN] = OR_SYMBOL, _e[Lexer.IMP_TOKEN] = IMP_SYMBOL, _e);
    var quantifiers = (_f = {}, _f[Lexer.FORALL_TOKEN] = FORALL_SYMBOL, _f[Lexer.EXISTS_TOKEN] = EXISTS_SYMBOL, _f);
    function parseFormula(lexer) {
        var leadToken = lexer.peek();
        if (leadToken === null)
            return null;
        var tokenType = leadToken[0];
        if (unaryConnectives[tokenType] !== void (0)) {
            lexer.next();
            var f = parseAtomicFormula(lexer);
            if (f === null)
                return null;
            return new UnaryConnective(unaryConnectives[tokenType], f);
        }
        else if (quantifiers[tokenType] !== void (0)) {
            var nameToken = lexer.next();
            if (nameToken === 'done' || nameToken === 'error' || nameToken[0] !== Lexer.NAME_TOKEN)
                return null;
            var periodToken = lexer.next();
            if (periodToken === 'done' || periodToken === 'error' || periodToken[0] !== Lexer.PERIOD_TOKEN)
                return null;
            lexer.next();
            var formula = parseAtomicFormula(lexer);
            if (formula === null)
                return null;
            var v = parseVariable(nameToken[1]);
            if (v === null)
                return null;
            return new Quantifier(quantifiers[tokenType], v, formula);
        }
        else {
            var lf = parseAtomicFormula(lexer);
            if (lf === null)
                return null;
            var rf = parseFormulaTail(lexer);
            if (rf === null)
                return lf;
            var conn = binaryConnectives[rf[0]];
            if (conn === void (0))
                return null;
            return new BinaryConnective(lf, conn, rf[1]);
        }
    }
    function parseAtomicFormula(lexer) {
        var leadToken = lexer.peek();
        if (leadToken === null)
            return null;
        var tokenType = leadToken[0];
        if (nullaryConnectives[tokenType] !== void (0)) {
            lexer.next();
            return new NullaryConnective(nullaryConnectives[tokenType]);
        }
        else {
            switch (tokenType) {
                case Lexer.NAME_TOKEN:
                    var lparenToken = lexer.next();
                    if (lparenToken === 'error')
                        return null;
                    if (lparenToken === 'done' || lparenToken[0] !== Lexer.LPAREN_TOKEN)
                        return new Predicate(leadToken[1]);
                    lexer.next();
                    var terms = parseTermList(lexer);
                    if (terms === null)
                        return null;
                    var rparenToken = lexer.peek();
                    if (rparenToken === null || rparenToken[0] !== Lexer.RPAREN_TOKEN)
                        return null;
                    lexer.next();
                    return new (Predicate.bind.apply(Predicate, [void 0, leadToken[1]].concat(terms)))();
                case Lexer.LPAREN_TOKEN:
                    lexer.next();
                    var formula = parseFormula(lexer);
                    if (formula === null)
                        return null;
                    var rparenToken2 = lexer.peek();
                    if (rparenToken2 === null || rparenToken2[0] !== Lexer.RPAREN_TOKEN)
                        return null;
                    lexer.next();
                    return formula;
                default:
                    return null;
            }
        }
    }
    function parseFormulaTail(lexer) {
        var bc = lexer.peek();
        if (bc === null || (bc[0] !== Lexer.AND_TOKEN && bc[0] !== Lexer.OR_TOKEN && bc[0] !== Lexer.IMP_TOKEN))
            return null;
        lexer.next();
        var rf = parseAtomicFormula(lexer);
        if (rf === null)
            return null;
        return [bc[0], rf];
    }
    function parseGoal(lexer, lax) {
        if (lax === void 0) { lax = true; }
        var premises = parseFormulaList(lexer);
        if (premises === null)
            return null;
        var turnstileToken = lexer.peek();
        if (turnstileToken === null || turnstileToken[0] !== Lexer.TURNSTILE_TOKEN) {
            if (lax && premises.length === 1) {
                return new Goal([], premises);
            }
            else {
                return null;
            }
        }
        lexer.next();
        var consequences = parseFormulaList(lexer);
        if (consequences === null)
            return null;
        return new Goal(premises, consequences);
    }
    function parseFormulaList(lexer) {
        var firstFormula = parseFormula(lexer);
        if (firstFormula === null)
            return [];
        var formulas = [firstFormula];
        while (true) {
            var commaToken = lexer.peek();
            if (commaToken === null || commaToken[0] !== Lexer.COMMA_TOKEN)
                return formulas;
            lexer.next();
            var nextFormula = parseFormula(lexer);
            if (nextFormula === null)
                return null;
            formulas.push(nextFormula);
        }
    }
    function goalFromString(s, lax) {
        if (lax === void 0) { lax = true; }
        var lexer = new Lexer(s);
        var goal = parseGoal(lexer, lax);
        if (lexer.peek() !== null)
            return null;
        return goal;
    }
    var OpenDerivation = (function () {
        function OpenDerivation(conclusion) {
            this.conclusion = conclusion;
        }
        OpenDerivation.prototype.match = function (openCase, inferenceCase) {
            return openCase(this.conclusion);
        };
        OpenDerivation.prototype.toJson = function () {
            return { c: this.conclusion.toJson() };
        };
        OpenDerivation.prototype.toLaTeX = function (topLevel) {
            return this.conclusion.toLaTeX(true);
        };
        OpenDerivation.prototype.isCompleted = function () { return false; };
        return OpenDerivation;
    }());
    var Inference = (function () {
        function Inference(name, premises, conclusion) {
            this.name = name;
            this.premises = premises;
            this.conclusion = conclusion;
        }
        Inference.prototype.match = function (openCase, inferenceCase) {
            return inferenceCase(this.name, this.premises, this.conclusion);
        };
        Inference.prototype.toJson = function () {
            return { n: this.name, c: this.conclusion.toJson(), p: this.premises.map(function (p) { return p.toJson(); }) };
        };
        Inference.prototype.toLaTeX = function (topLevel) {
            return '\\dfrac{' + this.premises.map(function (p) { return p.toLaTeX(true); }).join('\\qquad ') + '}{' + this.conclusion.toLaTeX(true) + '}\\rlap{(' + this.name + ')}';
        };
        Inference.prototype.isCompleted = function () { return this.premises.every(function (p) { return p.isCompleted(); }); };
        return Inference;
    }());
    function derivationFromJson(json) {
        if (typeof json !== 'object' || json === null || !('c' in json))
            return null;
        var conclusion = goalFromJson(json.c);
        if (conclusion === null)
            return null;
        if ('n' in json) {
            var name_1 = json.n;
            if (typeof name_1 !== 'string')
                return null;
            var p = json.p;
            if (typeof p !== 'object' || p === null || !(p instanceof Array))
                return null;
            var premises = nullMap(p, derivationFromJson);
            if (premises === null)
                return null;
            return new Inference(name_1, premises, conclusion);
        }
        else {
            return new OpenDerivation(conclusion);
        }
    }
    var StartPath = (function () {
        function StartPath(s) {
            this.start = ':' + s;
        }
        StartPath.prototype.extend = function (branch) {
            return new ExtendPath(branch, this);
        };
        StartPath.prototype.toString = function (branches) {
            if (branches === void 0) { branches = []; }
            return this.start + branches.map(function (b) { return b.toString(); }).join('.');
        };
        return StartPath;
    }());
    var ExtendPath = (function () {
        function ExtendPath(branch, prev) {
            this.branch = branch;
            this.prev = prev;
        }
        ExtendPath.prototype.extend = function (branch) {
            return new ExtendPath(branch, this);
        };
        ExtendPath.prototype.toString = function (branches) {
            if (branches === void 0) { branches = []; }
            branches.push(this.branch);
            return this.prev.toString(branches);
        };
        return ExtendPath;
    }());
    var GoalExtender = (function () {
        function GoalExtender(goal) {
            this.goal = goal;
        }
        GoalExtender.prototype.extend = function (name, premises) { return new Inference(name, premises, this.goal); };
        GoalExtender.prototype.open = function () { return new OpenDerivation(this.goal); };
        return GoalExtender;
    }());
    var InferenceExtender = (function () {
        function InferenceExtender(name, left, goal, right, extender) {
            this.name = name;
            this.left = left;
            this.goal = goal;
            this.right = right;
            this.extender = extender;
        }
        InferenceExtender.prototype.extend = function (name, premises) {
            return this.extender.extend(this.name, this.left.concat(new Inference(name, premises, this.goal), this.right));
        };
        InferenceExtender.prototype.open = function () {
            return this.extender.extend(this.name, this.left.concat(new OpenDerivation(this.goal), this.right));
        };
        return InferenceExtender;
    }());
    var Var = (function () {
        function Var(name, subscript) {
            if (subscript === void 0) { subscript = -1; }
            this.name = name;
            this.subscript = subscript;
        }
        Var.prototype.equals = function (other) {
            return this.name === other.name && this.subscript === other.subscript;
        };
        Var.prototype.toJson = function () {
            return this.subscript === -1 ? this.name : this.name + '.' + this.subscript;
        };
        Var.prototype.toDisplayString = function () { return this.subscript === -1 ? this.name : this.name + '_' + this.subscript; };
        Var.prototype.toLaTeX = function () { return this.subscript === -1 ? this.name : this.name + '_{' + this.subscript + '}'; };
        Var.prototype.hashCode = function () {
            return (hash(this.name) + hash(this.subscript)) | 0;
        };
        Var.prototype.freshen = function (variableContext) {
            var sub = this.subscript + 1;
            var v = new Var(this.name, sub);
            while (variableContext.has(v)) {
                v = new Var(this.name, ++sub);
            }
            return v;
        };
        return Var;
    }());
    function renderTerm(t) {
        return t.match(function (v) { return wire()(templateObject_1 || (templateObject_1 = __makeTemplateObject(["<span class=\"occurrence\">", "", "</span>"], ["<span class=\"occurrence\">", "", "</span>"])), v.name, v.subscript !== -1 ? [wire()(templateObject_2 || (templateObject_2 = __makeTemplateObject(["<sub>", "</sub>"], ["<sub>", "</sub>"])), v.subscript)] : []); }, function (o) {
            var ts = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                ts[_i - 1] = arguments[_i];
            }
            return wire()(templateObject_3 || (templateObject_3 = __makeTemplateObject(["<span class=\"operator\">", "</span>(", ")"], ["<span class=\"operator\">", "</span>(",
                ")"])), o, ts.flatMap(function (t, i) { return i + 1 === ts.length ? [renderTerm(t)] : [renderTerm(t), wire()(templateObject_4 || (templateObject_4 = __makeTemplateObject([", "], [", "])))]; }));
        });
    }
    function renderFormula(f, path, inPremises, extraClasses, extender) {
        var id = path.toString();
        if (extender !== void (0)) {
            var extraData_1 = { extender: extender, formula: f, inPremises: inPremises };
            return f.match(function (p) {
                var ts = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    ts[_i - 1] = arguments[_i];
                }
                return wire(f, id)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"predicate\"><span class=\"predicateSymbol\">", "</span>", "", "", "</span></div>"], ["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"predicate\"><span class=\"predicateSymbol\">", "</span>", "",
                    "", "</span></div>"])), id, extraData_1, 'formula active ' + extraClasses, p, ts.length === 0 ? '' : '(', ts.flatMap(function (t, i) { return i + 1 === ts.length ? [renderTerm(t)]
                    : [renderTerm(t), wire()(templateObject_6 || (templateObject_6 = __makeTemplateObject([", "], [", "])))]; }), ts.length === 0 ? '' : ')');
            }, function (c) { return wire(f, id)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["<div id=\"", "\" data=", " class=\"", "\"><span class=\"connective nullary\">", "</span></div>"], ["<div id=\"", "\" data=", " class=\"", "\"><span class=\"connective nullary\">", "</span></div>"])), id, extraData_1, 'formula active ' + extraClasses, c); }, function (c, f) { return wire(f, id)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"connective unary\">", "</span>", "</div>"], ["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"connective unary\">", "</span>",
                "</div>"])), id, extraData_1, 'formula active ' + extraClasses, c, renderFormula(f, path.extend(1), inPremises, '')); }, function (lf, c, rf) { return wire(f, id)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["<div id=\"", "\" data=", " class=\"", "\">", "<span class=\"connective binary\">", "</span>", "</div>"], ["<div id=\"", "\" data=", " class=\"", "\">",
                "<span class=\"connective binary\">", "</span>",
                "</div>"])), id, extraData_1, 'formula active ' + extraClasses, renderFormula(lf, path.extend(1), inPremises, 'left'), c, renderFormula(rf, path.extend(2), inPremises, 'right')); }, function (q, v, f) { return wire(f, id)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"connective quantifier\">", "</span><!--\n                --><span class=\"boundVariable\">", "", "</span><!--\n                --><span class=\"quantifierSeparator\">.</span>", "</div>"], ["<div id=\"", "\" data=", " class=\"", "\"><!--\n                --><span class=\"connective quantifier\">", "</span><!--\n                --><span class=\"boundVariable\">", "", "</span><!--\n                --><span class=\"quantifierSeparator\">.</span>",
                "</div>"])), id, extraData_1, 'formula active quantifier ' + extraClasses, q, v.name, v.subscript !== -1 ? [wire()(templateObject_11 || (templateObject_11 = __makeTemplateObject(["<sub>", "</sub>"], ["<sub>", "</sub>"])), v.subscript)] : [], renderFormula(f, path.extend(1), inPremises, '')); });
        }
        else {
            return f.match(function (p) {
                var ts = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    ts[_i - 1] = arguments[_i];
                }
                return wire(f, id)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\"><!--\n                --><span class=\"predicate\"><span class=\"predicateSymbol\">", "</span>", "", "", "</span></div>"], ["<div id=\"", "\" class=\"", "\"><!--\n                --><span class=\"predicate\"><span class=\"predicateSymbol\">", "</span>", "",
                    "", "</span></div>"])), id, 'formula ' + extraClasses, p, ts.length === 0 ? '' : '(', ts.flatMap(function (t, i) { return i + 1 === ts.length ? [renderTerm(t)]
                    : [renderTerm(t), wire()(templateObject_13 || (templateObject_13 = __makeTemplateObject([", "], [", "])))]; }), ts.length === 0 ? '' : ')');
            }, function (c) { return wire(f, id)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\"><span class=\"connective nullary\">", "</span></div>"], ["<div id=\"", "\" class=\"", "\"><span class=\"connective nullary\">", "</span></div>"])), id, 'formula ' + extraClasses, c); }, function (c, f) { return wire(f, id)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\">(<!--\n                    --><span class=\"connective unary\">", "</span>", ")</div>"], ["<div id=\"", "\" class=\"", "\">(<!--\n                    --><span class=\"connective unary\">", "</span>",
                ")</div>"])), id, 'formula ' + extraClasses, c, renderFormula(f, path.extend(1), inPremises, '')); }, function (lf, c, rf) { return wire(f, id)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\">(", "<span class=\"connective binary\">", "</span>", ")</div>"], ["<div id=\"", "\" class=\"", "\">(",
                "<span class=\"connective binary\">", "</span>",
                ")</div>"])), id, 'formula ' + extraClasses, renderFormula(lf, path.extend(1), inPremises, ''), c, renderFormula(rf, path.extend(2), inPremises, '')); }, function (q, v, f) { return wire(f, id)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\">(<!--\n                    --><span class=\"connective quantifier\">", "</span><!--\n                    --><span class=\"boundVariable\">", "", "</span><!--\n                    --><span class=\"quantifierSeparator\">.</span>", ")</div>"], ["<div id=\"", "\" class=\"", "\">(<!--\n                    --><span class=\"connective quantifier\">", "</span><!--\n                    --><span class=\"boundVariable\">", "", "</span><!--\n                    --><span class=\"quantifierSeparator\">.</span>",
                ")</div>"])), id, 'formula quantifier ' + extraClasses, q, v.name, v.subscript !== -1 ? [wire()(templateObject_18 || (templateObject_18 = __makeTemplateObject(["<sub>", "</sub>"], ["<sub>", "</sub>"])), v.subscript)] : [], renderFormula(f, path.extend(1), inPremises, '')); });
        }
    }
    function renderGoal(g, path, extender) {
        var id = path.toString();
        return g.match(function (ps, cs) {
            var psLen = ps.length;
            var psLenm1 = psLen - 1;
            var csLenm1 = cs.length - 1;
            return wire(g, id)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["<div id=\"", "\" class=\"goal\">", "<span class=\"turnstile\" title=\"reset\" data=", ">\u22A2</span>", "</div>"], ["<div id=\"", "\" class=\"goal\">",
                "<span class=\"turnstile\" title=\"reset\" data=", ">\u22A2</span>",
                "</div>"])), id, wire(ps, id)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["<div id=\"", "\" class=\"premises context\">", "</div>"], ["<div id=\"", "\" class=\"premises context\">",
                "</div>"])), id + "premises", ps.flatMap(function (p, i) { return i === psLenm1 ? [renderFormula(p, path.extend(i), true, 'topLevel', extender)]
                : [renderFormula(p, path.extend(i), true, 'topLevel', extender), wire()(templateObject_21 || (templateObject_21 = __makeTemplateObject([", "], [", "])))]; })), { extender: extender }, wire(cs, id)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["<div id=\"", "\" class=\"consequences context\">", "</div>"], ["<div id=\"", "\" class=\"consequences context\">",
                "</div>"])), id + "consequences", cs.flatMap(function (c, i) { return i === csLenm1 ? [renderFormula(c, path.extend(i + psLen), false, 'topLevel', extender)]
                : [renderFormula(c, path.extend(i + psLen), false, 'topLevel', extender), wire()(templateObject_23 || (templateObject_23 = __makeTemplateObject([", "], [", "])))]; })));
        });
    }
    function renderDerivation(d, path, extender, first, root) {
        if (first === void 0) { first = true; }
        if (root === void 0) { root = false; }
        var id = path.toString();
        var classes = (first ? 'derivation first' : 'derivation') + (root && d.isCompleted() ? ' completed' : '');
        return d.match(function (c) { return wire(d, id)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\">", "</div>"], ["<div id=\"", "\" class=\"", "\">", "</div>"])), id, classes + ' open', renderGoal(c, path, extender)); }, function (n, ps, c) {
            return wire(d, id)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["<div id=\"", "\" class=\"", "\"><!--\n            --><div class=\"row rulePremise\">", "</div><!--\n            --><div class=\"tag\" title=\"", "\">", "</div><!--\n            --><div class=\"row ruleConclusion\">", "</div></div>"], ["<div id=\"", "\" class=\"", "\"><!--\n            --><div class=\"row rulePremise\">",
                "</div><!--\n            --><div class=\"tag\" title=\"", "\">", "</div><!--\n            --><div class=\"row ruleConclusion\">",
                "</div></div>"])), id, classes + ' closed', ps.map(function (p, i) {
                var newExtender = new InferenceExtender(n, ps.slice(0, i), p.conclusion, ps.slice(i + 1), extender);
                return renderDerivation(p, path.extend(i), newExtender, i === 0);
            }), renderTagTitle(n), n, renderGoal(c, path.extend(ps.length), extender));
        });
    }
    var tagNameToDescription = {
        "Ax": "axiom",
        "⊤L": "top left",
        "⊤R": "top right",
        "⊥L": "bottom left (ex falso quodlibet, principle of explosion)",
        "⊥R": "bottom right",
        "¬L": "left negation (resolution)",
        "¬R": "right negation (negation introduction)",
        "∧L": "left conjuction",
        "∧R": "right conjuction",
        "∨L": "left disjunction",
        "∨R": "right disjunction",
        "⇒L": "left implication (material implication)",
        "⇒R": "right implication (detachment)",
        "∀L": "left univers (universal instantiation)",
        "∀R": "right universal (universal generalization)",
        "∃L": "left existential",
        "∃R": "right existential (existential instantiation)",
        "CL": "left contraction",
        "CR": "right contraction"
    };
    function renderTagTitle(name) {
        return tagNameToDescription[name] || '';
    }
    function open(conclusion) { return new OpenDerivation(conclusion); }
    var ApplyTactic = (function () {
        function ApplyTactic(goal, formula, inPremises, leftRight) {
            this.goal = goal;
            this.formula = formula;
            this.inPremises = inPremises;
            this.leftRight = leftRight;
        }
        ApplyTactic.prototype.match = function (applyTacticCase, contractCase, instantiateCase) {
            return applyTacticCase(this.goal, this.formula, this.inPremises, this.leftRight);
        };
        return ApplyTactic;
    }());
    var Contract = (function () {
        function Contract(goal, formula, inPremises) {
            this.goal = goal;
            this.formula = formula;
            this.inPremises = inPremises;
        }
        Contract.prototype.match = function (applyTacticCase, contractCase, instantiateCase) {
            return contractCase(this.goal, this.formula, this.inPremises);
        };
        return Contract;
    }());
    var Instantiate = (function () {
        function Instantiate(goal, formula, inPremises, term) {
            this.goal = goal;
            this.formula = formula;
            this.inPremises = inPremises;
            this.term = term;
        }
        Instantiate.prototype.match = function (applyTacticCase, contractCase, instantiateCase) {
            return instantiateCase(this.goal, this.formula, this.inPremises, this.term);
        };
        return Instantiate;
    }());
    var Failed = (function () {
        function Failed(message) {
            this.message = message;
        }
        Failed.prototype.match = function (failedCase, newGoalsCase, contractOrInstantiateCase) {
            return failedCase(this.message);
        };
        return Failed;
    }());
    var NewGoals = (function () {
        function NewGoals(name, goals) {
            this.name = name;
            this.goals = goals;
        }
        NewGoals.prototype.match = function (failedCase, newGoalsCase, contractOrInstantiateCase) {
            return newGoalsCase(this.name, this.goals);
        };
        return NewGoals;
    }());
    var ContractOrInstantiate = (function () {
        function ContractOrInstantiate(goal, formula, inPremises) {
            this.goal = goal;
            this.formula = formula;
            this.inPremises = inPremises;
        }
        ContractOrInstantiate.prototype.match = function (failedCase, newGoalsCase, contractOrInstantiateCase) {
            return contractOrInstantiateCase(this.goal, this.formula, this.inPremises);
        };
        return ContractOrInstantiate;
    }());
    var ljCalculus = function (input$$1) { return input$$1.match(function (goal, formula, inPremises, leftRight) { return formula.match(function (predicate) {
        var terms = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            terms[_i - 1] = arguments[_i];
        }
        if (inPremises) {
            if (goal.consequences[0].matches(predicate, terms)) {
                return new NewGoals('Ax', []);
            }
            else {
                return new Failed('Formula does not match conclusion.');
            }
        }
        else {
            if (goal.premises.some(function (c) { return c.matches(predicate, terms); })) {
                return new NewGoals('Ax', []);
            }
            else {
                return new Failed('Formula not found in premises.');
            }
        }
    }, function (connective) {
        switch (connective) {
            case TOP_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⊤L', [new Goal(goal.premises.filter(function (f) { return f !== formula; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('⊤R', []);
                }
            case BOT_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⊥L', []);
                }
                else {
                    if (goal.premises.some(function (p) { return p instanceof NullaryConnective && p.connective === BOT_SYMBOL; })) {
                        return new NewGoals('⊥L', []);
                    }
                    else {
                        return new Failed('Didn\'t find ⊥ in premises.');
                    }
                }
            default:
                throw 'Not implemented.';
        }
    }, function (connective, f2) {
        switch (connective) {
            case NOT_SYMBOL:
                if (inPremises) {
                    return new NewGoals('¬L', [new Goal(goal.premises, [f2])]);
                }
                else {
                    return new NewGoals('¬R', [new Goal(goal.premises.concat(f2), [new NullaryConnective(BOT_SYMBOL)])]);
                }
            default:
                throw 'Not implemented.';
        }
    }, function (lf, connective, rf) {
        switch (connective) {
            case AND_SYMBOL:
                if (inPremises) {
                    return new NewGoals('∧L', [new Goal(goal.premises.flatMap(function (f) { return f === formula ? [lf, rf] : [f]; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('∧R', [new Goal(goal.premises, [lf]), new Goal(goal.premises, [rf])]);
                }
            case OR_SYMBOL:
                if (inPremises) {
                    return new NewGoals('∨L', [new Goal(goal.premises.map(function (f) { return f === formula ? lf : f; }), goal.consequences),
                        new Goal(goal.premises.map(function (f) { return f === formula ? lf : f; }), goal.consequences)]);
                }
                else {
                    if (leftRight === void (0))
                        return new Failed('Select left or right subformula.');
                    return new NewGoals('∨R', [new Goal(goal.premises, [leftRight ? lf : rf])]);
                }
            case IMP_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⇒L', [new Goal(goal.premises, [lf]),
                        new Goal(goal.premises.map(function (f) { return f === formula ? rf : f; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('⇒R', [new Goal(goal.premises.concat(lf), [rf])]);
                }
            default:
                throw 'Not implemented.';
        }
    }, function (quantifier, v, f2) {
        switch (quantifier) {
            case FORALL_SYMBOL:
                if (inPremises) {
                    return new ContractOrInstantiate(goal, formula, inPremises);
                }
                else {
                    var variableContext = goal.freeVariables();
                    var f3 = variableContext.has(v) ? f2.alphaRename(v, v.freshen(variableContext)) : f2;
                    return new NewGoals('∀R', [new Goal(goal.premises, [f3])]);
                }
            case EXISTS_SYMBOL:
                if (inPremises) {
                    var variableContext = goal.freeVariables();
                    var f3_1 = variableContext.has(v) ? f2.alphaRename(v, v.freshen(variableContext)) : f2;
                    return new NewGoals('∃L', [new Goal(goal.premises.map(function (f) { return f === formula ? f3_1 : f; }), goal.consequences)]);
                }
                else {
                    return new ContractOrInstantiate(goal, formula, inPremises);
                }
            default:
                throw 'Not implemented.';
        }
    }); }, function (goal, formula, inPremises) {
        if (!inPremises)
            throw 'Should never happen.';
        return new NewGoals('CL', [new Goal(goal.premises.concat(formula), goal.consequences)]);
    }, function (goal, formula, inPremises, term) {
        if (!(formula instanceof Quantifier))
            throw 'Quantified formula expected.';
        if (inPremises) {
            var first_1 = 0;
            var f2_1 = formula.formula.substitute(formula.variable, term);
            return new NewGoals('∀L', [new Goal(goal.premises.map(function (f) { return f === formula && first_1++ === 0 ? f2_1 : f; }), goal.consequences)]);
        }
        else {
            var f2 = formula.formula.substitute(formula.variable, term);
            return new NewGoals('∃R', [new Goal(goal.premises, [f2])]);
        }
    }); };
    var classicalSequentCalculus = function (input$$1) { return input$$1.match(function (goal, formula, inPremises) { return formula.match(function (predicate) {
        var terms = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            terms[_i - 1] = arguments[_i];
        }
        if (inPremises) {
            if (goal.consequences.some(function (c) { return c.matches(predicate, terms); })) {
                return new NewGoals('Ax', []);
            }
            else {
                return new Failed('Formula not found in conclusions.');
            }
        }
        else {
            if (goal.premises.some(function (c) { return c.matches(predicate, terms); })) {
                return new NewGoals('Ax', []);
            }
            else {
                return new Failed('Formula not found in premises.');
            }
        }
    }, function (connective) {
        switch (connective) {
            case TOP_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⊤L', [new Goal(goal.premises.filter(function (f) { return f !== formula; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('⊤R', []);
                }
            case BOT_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⊥L', []);
                }
                else {
                    return new NewGoals('⊥R', [new Goal(goal.premises, goal.consequences.filter(function (f) { return f !== formula; }))]);
                }
            default:
                throw 'Not implemented.';
        }
    }, function (connective, f2) {
        switch (connective) {
            case NOT_SYMBOL:
                if (inPremises) {
                    return new NewGoals('¬L', [new Goal(goal.premises.filter(function (f) { return f !== formula; }), goal.consequences.concat(f2))]);
                }
                else {
                    return new NewGoals('¬R', [new Goal(goal.premises.concat(f2), goal.consequences.filter(function (f) { return f !== formula; }))]);
                }
            default:
                throw 'Not implemented.';
        }
    }, function (lf, connective, rf) {
        switch (connective) {
            case AND_SYMBOL:
                if (inPremises) {
                    return new NewGoals('∧L', [new Goal(goal.premises.flatMap(function (f) { return f === formula ? [lf, rf] : [f]; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('∧R', [new Goal(goal.premises, goal.consequences.map(function (f) { return f === formula ? lf : f; })),
                        new Goal(goal.premises, goal.consequences.map(function (f) { return f === formula ? rf : f; }))]);
                }
            case OR_SYMBOL:
                if (inPremises) {
                    return new NewGoals('∨L', [new Goal(goal.premises.map(function (f) { return f === formula ? lf : f; }), goal.consequences),
                        new Goal(goal.premises.map(function (f) { return f === formula ? rf : f; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('∨R', [new Goal(goal.premises, goal.consequences.flatMap(function (f) { return f === formula ? [lf, rf] : [f]; }))]);
                }
            case IMP_SYMBOL:
                if (inPremises) {
                    return new NewGoals('⇒L', [new Goal(goal.premises.filter(function (f) { return f !== formula; }), goal.consequences.concat(lf)),
                        new Goal(goal.premises.map(function (f) { return f === formula ? rf : f; }), goal.consequences)]);
                }
                else {
                    return new NewGoals('⇒R', [new Goal(goal.premises.concat(lf), goal.consequences.map(function (f) { return f === formula ? rf : f; }))]);
                }
            default:
                throw 'Not implemented.';
        }
    }, function (quantifier, v, f2) {
        switch (quantifier) {
            case FORALL_SYMBOL:
                if (inPremises) {
                    return new ContractOrInstantiate(goal, formula, inPremises);
                }
                else {
                    var variableContext = goal.freeVariables();
                    var f3_2 = variableContext.has(v) ? f2.alphaRename(v, v.freshen(variableContext)) : f2;
                    return new NewGoals('∀R', [new Goal(goal.premises, goal.consequences.map(function (f) { return f === formula ? f3_2 : f; }))]);
                }
            case EXISTS_SYMBOL:
                if (inPremises) {
                    var variableContext = goal.freeVariables();
                    var f3_3 = variableContext.has(v) ? f2.alphaRename(v, v.freshen(variableContext)) : f2;
                    return new NewGoals('∃L', [new Goal(goal.premises.map(function (f) { return f === formula ? f3_3 : f; }), goal.consequences)]);
                }
                else {
                    return new ContractOrInstantiate(goal, formula, inPremises);
                }
            default:
                throw 'Not implemented.';
        }
    }); }, function (goal, formula, inPremises) {
        if (inPremises) {
            return new NewGoals('CL', [new Goal(goal.premises.concat(formula), goal.consequences)]);
        }
        else {
            return new NewGoals('CR', [new Goal(goal.premises, goal.consequences.concat(formula))]);
        }
    }, function (goal, formula, inPremises, term) {
        if (!(formula instanceof Quantifier))
            throw 'Quantified formula expected.';
        if (inPremises) {
            var first_2 = 0;
            var f2_2 = formula.formula.substitute(formula.variable, term);
            return new NewGoals('∀L', [new Goal(goal.premises.map(function (f) { return f === formula && first_2++ === 0 ? f2_2 : f; }), goal.consequences)]);
        }
        else {
            var first_3 = 0;
            var f2_3 = formula.formula.substitute(formula.variable, term);
            return new NewGoals('∃R', [new Goal(goal.premises, goal.consequences.map(function (f) { return f === formula && first_3++ === 0 ? f2_3 : f; }))]);
        }
    }); };
    var logics = {
        lk: classicalSequentCalculus,
        lj: ljCalculus
    };
    function main(containerId, options) {
        var container = document.getElementById(containerId);
        if (container === null)
            throw "Container missing. Element with " + containerId + " not found.";
        var defaultGoalString = options.defaultGoal || '((A \\/ B) -> C) -> ((A -> C) /\\ (B -> C))';
        var defaultGoal = goalFromString(defaultGoalString);
        if (defaultGoal === null)
            throw "Error parsing default goal: " + defaultGoalString;
        var example = open(defaultGoal);
        var goalInput = wire()(templateObject_26 || (templateObject_26 = __makeTemplateObject(["<input type=\"text\" id=\"goalInput\" value=\"", "\"/>"], ["<input type=\"text\" id=\"goalInput\" value=\"", "\"/>"])), defaultGoalString);
        var toast = wire()(templateObject_27 || (templateObject_27 = __makeTemplateObject(["<div id=\"toast\"></div>"], ["<div id=\"toast\"></div>"])));
        var termInput = wire()(templateObject_28 || (templateObject_28 = __makeTemplateObject(["<input type=\"text\" id=\"termInput\"/>"], ["<input type=\"text\" id=\"termInput\"/>"])));
        var termBtn = wire()(templateObject_29 || (templateObject_29 = __makeTemplateObject(["<button id=\"termBtn\">Go</button>"], ["<button id=\"termBtn\">Go</button>"])));
        var contractBtn = wire()(templateObject_30 || (templateObject_30 = __makeTemplateObject(["<button id=\"contractBtn\">Contract</button>"], ["<button id=\"contractBtn\">Contract</button>"])));
        var popup = wire()(templateObject_31 || (templateObject_31 = __makeTemplateObject(["<div id=\"popup\"><div id=\"popupBody\">", "<p>Enter a term and click Go, or click Contract to perform a contraction.</p></div></div>"], ["<div id=\"popup\"><div id=\"popupBody\">", "<p>Enter a term and click Go, or click Contract to perform a contraction.</p></div></div>"])), [termInput, termBtn, contractBtn]);
        var latexBtn = wire()(templateObject_32 || (templateObject_32 = __makeTemplateObject(["<button id=\"latexBtn\">LaTeX</button>"], ["<button id=\"latexBtn\">LaTeX</button>"])));
        var latex = wire()(templateObject_33 || (templateObject_33 = __makeTemplateObject(["<code id=\"latex\"></code>"], ["<code id=\"latex\"></code>"])));
        var latexContainer = wire()(templateObject_34 || (templateObject_34 = __makeTemplateObject(["<div class=\"", "\">", "<pre>", "</pre></div>"], ["<div class=\"", "\">", "<pre>", "</pre></div>"])), options.toLaTeX ? '' : 'hidden', latexBtn, latex);
        var logic = options.logic === void (0) ? classicalSequentCalculus : logics[options.logic];
        var derivationFromHash = function () {
            try {
                var derivationJson = JSON.parse(decompressFromEncodedURIComponent(location.hash.slice(1)));
                if (derivationJson !== void (0)) {
                    var json = expandCse(derivationJson);
                    var derivation = derivationFromJson(json);
                    if (derivation !== null) {
                        example = derivation;
                        goalInput.value = '';
                    }
                    else {
                        console.log({ expanded: json, unexpanded: derivationJson, string: location.hash.slice(1) });
                    }
                }
            }
            catch (SyntaxError) { }
        };
        var dummy = {};
        var refresh = function (changeHash) {
            if (changeHash === void 0) { changeHash = true; }
            document.title = 'Proving ' + example.conclusion.toDisplayString(true);
            if (changeHash)
                location.hash = '#' + compressToEncodedURIComponent(JSON.stringify(cse(example.toJson())));
            bind(container)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["", ""], ["",
                ""])), [
                wire(dummy, 'goalBox')(templateObject_36 || (templateObject_36 = __makeTemplateObject(["<div id=\"goalBox\" class=\"", "\">Enter goal or formula: ", "</div>"], ["<div id=\"goalBox\" class=\"", "\">Enter goal or formula: ", "</div>"])), options.showInput ? '' : 'hidden', goalInput),
                toast,
                wire(dummy, 'wrapper')(templateObject_37 || (templateObject_37 = __makeTemplateObject(["<div id=\"derivationWrapper\">", "</div>"], ["<div id=\"derivationWrapper\">", "</div>"])), renderDerivation(example, new StartPath('root.'), new GoalExtender(example.conclusion), true, true)),
                popup,
                latexContainer
            ]);
        };
        var SHOWN_CLASS = 'shown';
        var FORALL_CLASS = 'forall';
        var EXISTS_CLASS = 'exists';
        var onClick = function (event) {
            var target = event.target;
            var extraData = target.data;
            if (target.data === void (0)) {
                var closest = target.closest('.active');
                if (closest === null)
                    return;
                extraData = closest.data;
            }
            if (extraData.formula === void (0)) {
                example = extraData.extender.open();
            }
            else {
                var leftRight = target.closest('.left') ? true : target.closest('.right') ? false : void (0);
                var output = logic(new ApplyTactic(extraData.extender.goal, extraData.formula, extraData.inPremises, leftRight));
                example = output.match(function (message) {
                    toast.textContent = message;
                    toast.classList.add(SHOWN_CLASS);
                    return example;
                }, function (name, goals) { return extraData.extender.extend(name, goals.map(function (g) { return new OpenDerivation(g); })); }, function (goal, formula, inPremises) {
                    popup.data = extraData;
                    popup.style.left = (event.pageX - 45) + 'px';
                    popup.style.top = (event.pageY - 40) + 'px';
                    popup.className = 'shown ' + (inPremises ? FORALL_CLASS : EXISTS_CLASS);
                    termInput.focus();
                    return example;
                });
            }
            refresh();
        };
        var onTermInput = function (event) {
            var extraData = popup.data;
            var output;
            if (event.target === contractBtn) {
                output = logic(new Contract(extraData.extender.goal, extraData.formula, extraData.inPremises));
            }
            else {
                var termString = termInput.value;
                var term = termFromString(termString);
                if (term === null) {
                    output = new Failed("Failed to parse term: " + termString);
                }
                else {
                    output = logic(new Instantiate(extraData.extender.goal, extraData.formula, extraData.inPremises, term));
                }
            }
            termInput.value = '';
            popup.className = '';
            example = output.match(function (message) {
                toast.textContent = message;
                toast.classList.add(SHOWN_CLASS);
                return example;
            }, function (name, goals) { return extraData.extender.extend(name, goals.map(function (g) { return new OpenDerivation(g); })); }, function (goal, formula, inPremises) {
                throw 'Shouldn\'t happen';
            });
            refresh();
        };
        var onGoalInput = function (event) {
            var goalText = goalInput.value;
            var goal = goalFromString(goalText);
            if (goal === null || (options.logic === 'lj' && goal.consequences.length !== 1)) {
                toast.textContent = 'Failed to parse goal.';
                toast.classList.add(SHOWN_CLASS);
            }
            else {
                example = new OpenDerivation(goal);
                refresh();
            }
        };
        var onAnimationEnd = function (event) { return toast.classList.remove(SHOWN_CLASS); };
        var onMouseLeave = function (event) { popup.data = void (0); popup.className = ''; };
        var onHashChange = function (event) { derivationFromHash(); refresh(false); };
        var onLaTeX = function (event) { latex.textContent = example.toLaTeX(true); };
        var scheduler = newDefaultScheduler$2();
        runEffects$$1(tap$$1(onClick, click(container, true)), scheduler);
        runEffects$$1(tap$$1(onTermInput, merge$$1(change(termInput), merge$$1(click(termBtn), click(contractBtn)))), scheduler);
        runEffects$$1(tap$$1(onGoalInput, change(goalInput)), scheduler);
        runEffects$$1(tap$$1(onAnimationEnd, domEvent('animationend', toast)), scheduler);
        runEffects$$1(tap$$1(onMouseLeave, mouseleave(popup)), scheduler);
        runEffects$$1(tap$$1(onHashChange, hashchange(window)), scheduler);
        runEffects$$1(tap$$1(onLaTeX, click(latexBtn)), scheduler);
        derivationFromHash();
        refresh(false);
    }
    var templateObject_2, templateObject_1, templateObject_4, templateObject_3, templateObject_6, templateObject_5, templateObject_7, templateObject_8, templateObject_9, templateObject_11, templateObject_10, templateObject_13, templateObject_12, templateObject_14, templateObject_15, templateObject_16, templateObject_18, templateObject_17, templateObject_21, templateObject_20, templateObject_23, templateObject_22, templateObject_19, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_36, templateObject_37, templateObject_35;
    var _a, _b, _c, _d, _e, _f;

    exports.Lexer = Lexer;
    exports.main = main;

    return exports;

}({}));
