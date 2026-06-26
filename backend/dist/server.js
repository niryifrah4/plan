import{createRequire}from'module';const require=createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../node_modules/@supabase/supabase-js/dist/index.cjs
var require_dist = __commonJS({
  "../node_modules/@supabase/supabase-js/dist/index.cjs"(exports) {
    "use strict";
    var __supabase_functions_js = __require("@supabase/functions-js");
    var __supabase_postgrest_js = __require("@supabase/postgrest-js");
    var __supabase_realtime_js = __require("@supabase/realtime-js");
    var __supabase_storage_js = __require("@supabase/storage-js");
    var __supabase_auth_js = __require("@supabase/auth-js");
    var version = "2.104.0";
    var JS_ENV = "";
    if (typeof Deno !== "undefined") JS_ENV = "deno";
    else if (typeof document !== "undefined") JS_ENV = "web";
    else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") JS_ENV = "react-native";
    else JS_ENV = "node";
    var DEFAULT_HEADERS = { "X-Client-Info": `supabase-js-${JS_ENV}/${version}` };
    var DEFAULT_GLOBAL_OPTIONS = { headers: DEFAULT_HEADERS };
    var DEFAULT_DB_OPTIONS = { schema: "public" };
    var DEFAULT_AUTH_OPTIONS = {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    };
    var DEFAULT_REALTIME_OPTIONS = {};
    function _typeof(o) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
        return typeof o$1;
      } : function(o$1) {
        return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
      }, _typeof(o);
    }
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    function ownKeys(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r$1) {
          return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys(Object(t), true).forEach(function(r$1) {
          _defineProperty(e, r$1, t[r$1]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r$1) {
          Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
        });
      }
      return e;
    }
    var resolveFetch = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    var resolveHeadersConstructor = () => {
      return Headers;
    };
    var fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
      const fetch$1 = resolveFetch(customFetch);
      const HeadersConstructor = resolveHeadersConstructor();
      return async (input, init) => {
        var _await$getAccessToken;
        const accessToken = (_await$getAccessToken = await getAccessToken()) !== null && _await$getAccessToken !== void 0 ? _await$getAccessToken : supabaseKey;
        let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
        if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch$1(input, _objectSpread2(_objectSpread2({}, init), {}, { headers }));
      };
    };
    function ensureTrailingSlash(url) {
      return url.endsWith("/") ? url : url + "/";
    }
    function applySettingDefaults(options, defaults) {
      var _DEFAULT_GLOBAL_OPTIO, _globalOptions$header;
      const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
      const { db: DEFAULT_DB_OPTIONS$1, auth: DEFAULT_AUTH_OPTIONS$1, realtime: DEFAULT_REALTIME_OPTIONS$1, global: DEFAULT_GLOBAL_OPTIONS$1 } = defaults;
      const result = {
        db: _objectSpread2(_objectSpread2({}, DEFAULT_DB_OPTIONS$1), dbOptions),
        auth: _objectSpread2(_objectSpread2({}, DEFAULT_AUTH_OPTIONS$1), authOptions),
        realtime: _objectSpread2(_objectSpread2({}, DEFAULT_REALTIME_OPTIONS$1), realtimeOptions),
        storage: {},
        global: _objectSpread2(_objectSpread2(_objectSpread2({}, DEFAULT_GLOBAL_OPTIONS$1), globalOptions), {}, { headers: _objectSpread2(_objectSpread2({}, (_DEFAULT_GLOBAL_OPTIO = DEFAULT_GLOBAL_OPTIONS$1 === null || DEFAULT_GLOBAL_OPTIONS$1 === void 0 ? void 0 : DEFAULT_GLOBAL_OPTIONS$1.headers) !== null && _DEFAULT_GLOBAL_OPTIO !== void 0 ? _DEFAULT_GLOBAL_OPTIO : {}), (_globalOptions$header = globalOptions === null || globalOptions === void 0 ? void 0 : globalOptions.headers) !== null && _globalOptions$header !== void 0 ? _globalOptions$header : {}) }),
        accessToken: async () => ""
      };
      if (options.accessToken) result.accessToken = options.accessToken;
      else delete result.accessToken;
      return result;
    }
    function validateSupabaseUrl(supabaseUrl) {
      const trimmedUrl = supabaseUrl === null || supabaseUrl === void 0 ? void 0 : supabaseUrl.trim();
      if (!trimmedUrl) throw new Error("supabaseUrl is required.");
      if (!trimmedUrl.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
      try {
        return new URL(ensureTrailingSlash(trimmedUrl));
      } catch (_unused) {
        throw Error("Invalid supabaseUrl: Provided URL is malformed.");
      }
    }
    var SupabaseAuthClient = class extends __supabase_auth_js.AuthClient {
      constructor(options) {
        super(options);
      }
    };
    var SupabaseClient = class {
      /**
      * Create a new client for use in the browser.
      *
      * @category Initializing
      *
      * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
      * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
      * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
      * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
      * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
      * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
      * @param options.realtime Options passed along to realtime-js constructor.
      * @param options.storage Options passed along to the storage-js constructor.
      * @param options.global.fetch A custom fetch implementation.
      * @param options.global.headers Any additional headers to send with each network request.
      *
      * @example Creating a client
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * // Create a single supabase client for interacting with your database
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key')
      * ```
      *
      * @example With a custom domain
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * // Use a custom domain as the supabase URL
      * const supabase = createClient('https://my-custom-domain.com', 'publishable-or-anon-key')
      * ```
      *
      * @example With additional parameters
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const options = {
      *   db: {
      *     schema: 'public',
      *   },
      *   auth: {
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: true
      *   },
      *   global: {
      *     headers: { 'x-my-custom-header': 'my-app-name' },
      *   },
      * }
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", options)
      * ```
      *
      * @exampleDescription With custom schemas
      * By default the API server points to the `public` schema. You can enable other database schemas within the Dashboard.
      * Go to [Settings > API > Exposed schemas](/dashboard/project/_/settings/api) and add the schema which you want to expose to the API.
      *
      * Note: each client connection can only access a single schema, so the code above can access the `other_schema` schema but cannot access the `public` schema.
      *
      * @example With custom schemas
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
      *   // Provide a custom schema. Defaults to "public".
      *   db: { schema: 'other_schema' }
      * })
      * ```
      *
      * @exampleDescription Custom fetch implementation
      * `supabase-js` uses the [`cross-fetch`](https://www.npmjs.com/package/cross-fetch) library to make HTTP requests,
      * but an alternative `fetch` implementation can be provided as an option.
      * This is most useful in environments where `cross-fetch` is not compatible (for instance Cloudflare Workers).
      *
      * @example Custom fetch implementation
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
      *   global: { fetch: fetch.bind(globalThis) }
      * })
      * ```
      *
      * @exampleDescription React Native options with AsyncStorage
      * For React Native we recommend using `AsyncStorage` as the storage implementation for Supabase Auth.
      *
      * @example React Native options with AsyncStorage
      * ```js
      * import 'react-native-url-polyfill/auto'
      * import { createClient } from '@supabase/supabase-js'
      * import AsyncStorage from "@react-native-async-storage/async-storage";
      *
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
      *   auth: {
      *     storage: AsyncStorage,
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: false,
      *   },
      * });
      * ```
      *
      * @exampleDescription React Native options with Expo SecureStore
      * If you wish to encrypt the user's session information, you can use `aes-js` and store the encryption key in Expo SecureStore.
      * The `aes-js` library, a reputable JavaScript-only implementation of the AES encryption algorithm in CTR mode.
      * A new 256-bit encryption key is generated using the `react-native-get-random-values` library.
      * This key is stored inside Expo's SecureStore, while the value is encrypted and placed inside AsyncStorage.
      *
      * Please make sure that:
      * - You keep the `expo-secure-store`, `aes-js` and `react-native-get-random-values` libraries up-to-date.
      * - Choose the correct [`SecureStoreOptions`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestoreoptions) for your app's needs.
      *   E.g. [`SecureStore.WHEN_UNLOCKED`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestorewhen_unlocked) regulates when the data can be accessed.
      * - Carefully consider optimizations or other modifications to the above example, as those can lead to introducing subtle security vulnerabilities.
      *
      * @example React Native options with Expo SecureStore
      * ```ts
      * import 'react-native-url-polyfill/auto'
      * import { createClient } from '@supabase/supabase-js'
      * import AsyncStorage from '@react-native-async-storage/async-storage';
      * import * as SecureStore from 'expo-secure-store';
      * import * as aesjs from 'aes-js';
      * import 'react-native-get-random-values';
      *
      * // As Expo's SecureStore does not support values larger than 2048
      * // bytes, an AES-256 key is generated and stored in SecureStore, while
      * // it is used to encrypt/decrypt values stored in AsyncStorage.
      * class LargeSecureStore {
      *   private async _encrypt(key: string, value: string) {
      *     const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
      *
      *     const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
      *     const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
      *
      *     await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
      *
      *     return aesjs.utils.hex.fromBytes(encryptedBytes);
      *   }
      *
      *   private async _decrypt(key: string, value: string) {
      *     const encryptionKeyHex = await SecureStore.getItemAsync(key);
      *     if (!encryptionKeyHex) {
      *       return encryptionKeyHex;
      *     }
      *
      *     const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
      *     const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
      *
      *     return aesjs.utils.utf8.fromBytes(decryptedBytes);
      *   }
      *
      *   async getItem(key: string) {
      *     const encrypted = await AsyncStorage.getItem(key);
      *     if (!encrypted) { return encrypted; }
      *
      *     return await this._decrypt(key, encrypted);
      *   }
      *
      *   async removeItem(key: string) {
      *     await AsyncStorage.removeItem(key);
      *     await SecureStore.deleteItemAsync(key);
      *   }
      *
      *   async setItem(key: string, value: string) {
      *     const encrypted = await this._encrypt(key, value);
      *
      *     await AsyncStorage.setItem(key, encrypted);
      *   }
      * }
      *
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
      *   auth: {
      *     storage: new LargeSecureStore(),
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: false,
      *   },
      * });
      * ```
      *
      * @example With a database query
      * ```ts
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key')
      *
      * const { data } = await supabase.from('profiles').select('*')
      * ```
      */
      constructor(supabaseUrl, supabaseKey, options) {
        var _settings$auth$storag, _settings$global$head;
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        const baseUrl = validateSupabaseUrl(supabaseUrl);
        if (!supabaseKey) throw new Error("supabaseKey is required.");
        this.realtimeUrl = new URL("realtime/v1", baseUrl);
        this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
        this.authUrl = new URL("auth/v1", baseUrl);
        this.storageUrl = new URL("storage/v1", baseUrl);
        this.functionsUrl = new URL("functions/v1", baseUrl);
        const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
        const DEFAULTS = {
          db: DEFAULT_DB_OPTIONS,
          realtime: DEFAULT_REALTIME_OPTIONS,
          auth: _objectSpread2(_objectSpread2({}, DEFAULT_AUTH_OPTIONS), {}, { storageKey: defaultStorageKey }),
          global: DEFAULT_GLOBAL_OPTIONS
        };
        const settings = applySettingDefaults(options !== null && options !== void 0 ? options : {}, DEFAULTS);
        this.storageKey = (_settings$auth$storag = settings.auth.storageKey) !== null && _settings$auth$storag !== void 0 ? _settings$auth$storag : "";
        this.headers = (_settings$global$head = settings.global.headers) !== null && _settings$global$head !== void 0 ? _settings$global$head : {};
        if (!settings.accessToken) {
          var _settings$auth;
          this.auth = this._initSupabaseAuthClient((_settings$auth = settings.auth) !== null && _settings$auth !== void 0 ? _settings$auth : {}, this.headers, settings.global.fetch);
        } else {
          this.accessToken = settings.accessToken;
          this.auth = new Proxy({}, { get: (_, prop) => {
            throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
          } });
        }
        this.fetch = fetchWithAuth(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
        this.realtime = this._initRealtimeClient(_objectSpread2({
          headers: this.headers,
          accessToken: this._getAccessToken.bind(this)
        }, settings.realtime));
        if (this.accessToken) Promise.resolve(this.accessToken()).then((token) => this.realtime.setAuth(token)).catch((e) => console.warn("Failed to set initial Realtime auth token:", e));
        this.rest = new __supabase_postgrest_js.PostgrestClient(new URL("rest/v1", baseUrl).href, {
          headers: this.headers,
          schema: settings.db.schema,
          fetch: this.fetch,
          timeout: settings.db.timeout,
          urlLengthLimit: settings.db.urlLengthLimit
        });
        this.storage = new __supabase_storage_js.StorageClient(this.storageUrl.href, this.headers, this.fetch, options === null || options === void 0 ? void 0 : options.storage);
        if (!settings.accessToken) this._listenForAuthEvents();
      }
      /**
      * Supabase Functions allows you to deploy and invoke edge functions.
      */
      get functions() {
        return new __supabase_functions_js.FunctionsClient(this.functionsUrl.href, {
          headers: this.headers,
          customFetch: this.fetch
        });
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        return this.rest.from(relation);
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return this.rest.schema(schema);
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      rpc(fn, args = {}, options = {
        head: false,
        get: false,
        count: void 0
      }) {
        return this.rest.rpc(fn, args, options);
      }
      /**
      * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
      *
      * @param {string} name - The name of the Realtime channel.
      * @param {Object} opts - The options to pass to the Realtime channel.
      *
      */
      channel(name, opts = { config: {} }) {
        return this.realtime.channel(name, opts);
      }
      /**
      * Returns all Realtime channels.
      *
      * @category Initializing
      *
      * @example Get all channels
      * ```js
      * const channels = supabase.getChannels()
      * ```
      */
      getChannels() {
        return this.realtime.getChannels();
      }
      /**
      * Unsubscribes and removes Realtime channel from Realtime client.
      *
      * @param {RealtimeChannel} channel - The name of the Realtime channel.
      *
      *
      * @category Initializing
      *
      * @remarks
      * - Removing a channel is a great way to maintain the performance of your project's Realtime service as well as your database if you're listening to Postgres changes. Supabase will automatically handle cleanup 30 seconds after a client is disconnected, but unused channels may cause degradation as more clients are simultaneously subscribed.
      *
      * @example Removes a channel
      * ```js
      * supabase.removeChannel(myChannel)
      * ```
      */
      removeChannel(channel) {
        return this.realtime.removeChannel(channel);
      }
      /**
      * Unsubscribes and removes all Realtime channels from Realtime client.
      *
      * @category Initializing
      *
      * @remarks
      * - Removing channels is a great way to maintain the performance of your project's Realtime service as well as your database if you're listening to Postgres changes. Supabase will automatically handle cleanup 30 seconds after a client is disconnected, but unused channels may cause degradation as more clients are simultaneously subscribed.
      *
      * @example Remove all channels
      * ```js
      * supabase.removeAllChannels()
      * ```
      */
      removeAllChannels() {
        return this.realtime.removeAllChannels();
      }
      async _getAccessToken() {
        var _this = this;
        var _data$session$access_, _data$session;
        if (_this.accessToken) return await _this.accessToken();
        const { data } = await _this.auth.getSession();
        return (_data$session$access_ = (_data$session = data.session) === null || _data$session === void 0 ? void 0 : _data$session.access_token) !== null && _data$session$access_ !== void 0 ? _data$session$access_ : _this.supabaseKey;
      }
      _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, userStorage, storageKey, flowType, lock, debug, throwOnError }, headers, fetch$1) {
        const authHeaders = {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: `${this.supabaseKey}`
        };
        return new SupabaseAuthClient({
          url: this.authUrl.href,
          headers: _objectSpread2(_objectSpread2({}, authHeaders), headers),
          storageKey,
          autoRefreshToken,
          persistSession,
          detectSessionInUrl,
          storage,
          userStorage,
          flowType,
          lock,
          debug,
          throwOnError,
          fetch: fetch$1,
          hasCustomAuthorizationHeader: Object.keys(this.headers).some((key) => key.toLowerCase() === "authorization")
        });
      }
      _initRealtimeClient(options) {
        return new __supabase_realtime_js.RealtimeClient(this.realtimeUrl.href, _objectSpread2(_objectSpread2({}, options), {}, { params: _objectSpread2(_objectSpread2({}, { apikey: this.supabaseKey }), options === null || options === void 0 ? void 0 : options.params) }));
      }
      _listenForAuthEvents() {
        return this.auth.onAuthStateChange((event, session) => {
          this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
        });
      }
      _handleTokenChanged(event, source, token) {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
          this.changedAccessToken = token;
          this.realtime.setAuth(token);
        } else if (event === "SIGNED_OUT") {
          this.realtime.setAuth();
          if (source == "STORAGE") this.auth.signOut();
          this.changedAccessToken = void 0;
        }
      }
    };
    var createClient2 = (supabaseUrl, supabaseKey, options) => {
      return new SupabaseClient(supabaseUrl, supabaseKey, options);
    };
    function shouldShowDeprecationWarning() {
      if (typeof window !== "undefined") return false;
      const _process = globalThis["process"];
      if (!_process) return false;
      const processVersion = _process["version"];
      if (processVersion === void 0 || processVersion === null) return false;
      const versionMatch = processVersion.match(/^v(\d+)\./);
      if (!versionMatch) return false;
      return parseInt(versionMatch[1], 10) <= 18;
    }
    if (shouldShowDeprecationWarning()) console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");
    Object.defineProperty(exports, "FunctionRegion", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionRegion;
      }
    });
    Object.defineProperty(exports, "FunctionsError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsError;
      }
    });
    Object.defineProperty(exports, "FunctionsFetchError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsFetchError;
      }
    });
    Object.defineProperty(exports, "FunctionsHttpError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsHttpError;
      }
    });
    Object.defineProperty(exports, "FunctionsRelayError", {
      enumerable: true,
      get: function() {
        return __supabase_functions_js.FunctionsRelayError;
      }
    });
    Object.defineProperty(exports, "PostgrestError", {
      enumerable: true,
      get: function() {
        return __supabase_postgrest_js.PostgrestError;
      }
    });
    Object.defineProperty(exports, "StorageApiError", {
      enumerable: true,
      get: function() {
        return __supabase_storage_js.StorageApiError;
      }
    });
    exports.SupabaseClient = SupabaseClient;
    exports.createClient = createClient2;
    Object.keys(__supabase_auth_js).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function() {
          return __supabase_auth_js[k];
        }
      });
    });
    Object.keys(__supabase_realtime_js).forEach(function(k) {
      if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function() {
          return __supabase_realtime_js[k];
        }
      });
    });
  }
});

// src/lib/report-error.ts
function reportError(scope, e) {
  try {
    console.warn(`[${scope}]`, e);
  } catch {
  }
}
var init_report_error = __esm({
  "src/lib/report-error.ts"() {
    "use strict";
  }
});

// ../lib/client-scope.ts
function getActiveClientId() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT_HH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function getImpersonationUuid() {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(ACTIVE_HOUSEHOLD_UUID_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
function scopedKey(baseKey) {
  if (UNSCOPED_KEYS.has(baseKey)) return baseKey;
  if (typeof window === "undefined") return baseKey;
  const sub = baseKey.startsWith("verdant:") ? baseKey.slice("verdant:".length) : baseKey;
  const uuid = getImpersonationUuid();
  if (uuid) return `verdant:c:hh-${uuid.replace(/-/g, "").slice(0, 12)}:${sub}`;
  const id = getActiveClientId();
  if (id != null) return `verdant:c:${id}:${sub}`;
  return baseKey;
}
var CURRENT_HH_KEY, CLIENTS_REGISTRY_KEY, ACTIVE_HOUSEHOLD_UUID_KEY, UNSCOPED_KEYS;
var init_client_scope = __esm({
  "../lib/client-scope.ts"() {
    "use strict";
    init_report_error();
    CURRENT_HH_KEY = "verdant:current_hh";
    CLIENTS_REGISTRY_KEY = "verdant:clients";
    ACTIVE_HOUSEHOLD_UUID_KEY = "verdant:active_household_id";
    UNSCOPED_KEYS = /* @__PURE__ */ new Set([
      CURRENT_HH_KEY,
      CLIENTS_REGISTRY_KEY,
      ACTIVE_HOUSEHOLD_UUID_KEY,
      "verdant:last_activity"
    ]);
  }
});

// ../lib/doc-parser/normalizer.ts
function normalizeSupplier(description) {
  const lower = description.toLowerCase().replace(/[\u200F\u200E"]/g, "");
  for (const [canonical, variants] of SUPPLIER_GROUPS) {
    if (lower.includes(canonical.toLowerCase())) return canonical;
    for (const v of variants) {
      if (lower.includes(v.toLowerCase())) return canonical;
    }
  }
  return description;
}
function extractBitRecipient(description) {
  const cleaned = description.replace(/[\u200F\u200E"]/g, "").trim();
  const platformRx = /^(?:ביט|bit|paybox|pay\s*box|pepper|פפר)(?:\b|(?=[\s\-:,/]))[\s\-:,/]*/i;
  const bankPlatformRx = /^(?:poalim|hapoalim|הפועלים|leumi|לאומי)\s*(?:bit|paybox|ביט|פייבוקס)(?:\b|(?=[\s\-:,/]))[\s\-:,/]*/i;
  let rest = cleaned;
  if (bankPlatformRx.test(rest)) {
    rest = rest.replace(bankPlatformRx, "");
  } else if (platformRx.test(rest)) {
    rest = rest.replace(platformRx, "");
  } else {
    return null;
  }
  rest = rest.replace(/^\d{6,}[\s\-:,/]*/, "").trim();
  rest = rest.replace(/\s+\d{6,}\s*$/, "").trim();
  rest = rest.replace(/^(?:תשלום|העברה|מ-?|ל-?)\s*/i, "").trim();
  if (!rest) return null;
  if (rest.length < 2) return null;
  return rest;
}
var SUPPLIER_GROUPS;
var init_normalizer = __esm({
  "../lib/doc-parser/normalizer.ts"() {
    "use strict";
    SUPPLIER_GROUPS = [
      // ── Supermarkets ──
      ["\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC", ["\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC \u05D3\u05D9\u05DC", "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1", "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC \u05D0\u05D5\u05E0\u05DC\u05D9\u05D9\u05DF", "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC be", "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC \u05E9\u05DC\u05D9"]],
      ["\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9", ["\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05E9\u05D9\u05D5\u05D5\u05E7", "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 online", "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC"]],
      ["\u05D9\u05D5\u05D7\u05E0\u05E0\u05D5\u05E3", ["\u05D9\u05D5\u05D7\u05E0\u05E0\u05D5\u05E3 \u05E9\u05D9\u05D5\u05D5\u05E7", "\u05D9\u05D5\u05D7\u05E0\u05E0\u05D5\u05E3 \u05D7\u05E1\u05DB\u05D5\u05DF"]],
      ["\u05D5\u05D9\u05E7\u05D8\u05D5\u05E8\u05D9", ["\u05D5\u05D9\u05E7\u05D8\u05D5\u05E8\u05D9 \u05E1\u05D5\u05E4\u05E8\u05DE\u05E8\u05E7\u05D8", "victory"]],
      ["\u05D0\u05D5\u05E9\u05E8 \u05E2\u05D3", ["\u05D0\u05D5\u05E9\u05E8 \u05E2\u05D3 \u05E1\u05D5\u05E4\u05E8"]],
      // ── Pharmacy ──
      ["\u05E1\u05D5\u05E4\u05E8 \u05E4\u05D0\u05E8\u05DD", ["\u05E1\u05D5\u05E4\u05E8-\u05E4\u05D0\u05E8\u05DD", "super pharm", "super-pharm", "\u05E1\u05D5\u05E4\u05E8\u05E4\u05D0\u05E8\u05DD"]],
      // ── Gas ──
      ["\u05E4\u05D6", ["\u05E4\u05D6 \u05D3\u05DC\u05E7", "\u05E4\u05D6 yellow", "yellow \u05E4\u05D6"]],
      ["\u05E1\u05D5\u05E0\u05D5\u05DC", ["\u05E1\u05D5\u05E0\u05D5\u05DC \u05D3\u05DC\u05E7", "\u05E1\u05D5\u05E0\u05D5\u05DC direct"]],
      ["\u05D3\u05D5\u05E8 \u05D0\u05DC\u05D5\u05DF", ["\u05D3\u05D5\u05E8-\u05D0\u05DC\u05D5\u05DF", "\u05D3\u05D5\u05E8 \u05D0\u05DC\u05D5\u05DF \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4"]],
      // ── Cafes / restaurants ──
      ["\u05D0\u05E8\u05D5\u05DE\u05D4", ["\u05D0\u05E8\u05D5\u05DE\u05D4 \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1", "\u05D0\u05E8\u05D5\u05DE\u05D4 tlv", "aroma espresso", "aroma il"]],
      ["\u05E7\u05E4\u05D4 \u05DC\u05E0\u05D3\u05D5\u05D5\u05E8", ["landwer", "\u05DC\u05E0\u05D3\u05D5\u05D5\u05E8"]],
      ["\u05DE\u05E7\u05D3\u05D5\u05E0\u05DC\u05D3\u05E1", ["mcdonald's", "mcdonalds", "mcdonald"]],
      // ── Streaming / tech ──
      ["\u05E0\u05D8\u05E4\u05DC\u05D9\u05E7\u05E1", ["netflix", "netflix.com"]],
      ["\u05E1\u05E4\u05D5\u05D8\u05D9\u05E4\u05D9\u05D9", ["spotify", "spotify ab", "spotify premium"]],
      ["\u05D0\u05E4\u05DC", ["apple.com", "apple com bill", "itunes", "apple.com/bill"]],
      ["\u05D2\u05D5\u05D2\u05DC", ["google", "google storage", "google one", "google play"]],
      ["\u05D0\u05DE\u05D6\u05D5\u05DF", ["amazon", "amazon prime", "amzn", "amazon.com"]],
      // ── Health funds ──
      ["\u05DE\u05DB\u05D1\u05D9", ["\u05DE\u05DB\u05D1\u05D9 \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA", "\u05DE\u05DB\u05D1\u05D9 \u05E9\u05E8 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA", "\u05DE\u05DB\u05D1\u05D9 \u05E9.\u05D1"]],
      ["\u05DB\u05DC\u05DC\u05D9\u05EA", ["\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05EA", "\u05DB\u05DC\u05DC\u05D9\u05EA \u05DE\u05D5\u05E9", "\u05DB\u05DC\u05DC\u05D9\u05EA \u05DE\u05D5\u05E9\u05DC\u05DD"]],
      // ── Insurance ──
      ["\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1", ["\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1 \u05D7\u05D1\u05E8\u05D4 \u05DC\u05D1\u05D9\u05D8\u05D5\u05D7", "\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1 \u05D1\u05D9\u05D8"]],
      ["\u05DE\u05D2\u05D3\u05DC", ["\u05DE\u05D2\u05D3\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7", "\u05DE\u05D2\u05D3\u05DC \u05D7\u05D1\u05E8\u05D4 \u05DC\u05D1\u05D9\u05D8\u05D5\u05D7"]],
      ["\u05D4\u05E8\u05D0\u05DC", ["\u05D4\u05E8\u05D0\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7", "\u05D4\u05E8\u05D0\u05DC \u05D7\u05D1\u05E8\u05D4 \u05DC\u05D1\u05D9\u05D8\u05D5\u05D7"]],
      ["\u05DE\u05E0\u05D5\u05E8\u05D4", ["\u05DE\u05E0\u05D5\u05E8\u05D4 \u05DE\u05D1\u05D8\u05D7\u05D9\u05DD", "\u05DE\u05E0\u05D5\u05E8\u05D4 \u05D1\u05D9\u05D8"]],
      ["\u05D0\u05D9\u05D9\u05DC\u05D5\u05DF", ["\u05D0\u05D9\u05D9\u05DC\u05D5\u05DF \u05D1\u05D9\u05D8\u05D5\u05D7", "\u05D0\u05D9\u05D9\u05DC\u05D5\u05DF \u05D7\u05D1\u05E8\u05D4"]],
      // ── Fashion ──
      ["\u05D6\u05D0\u05E8\u05D4", ["zara", "zara.com"]],
      ["h&m", ["h & m", "hm.com"]],
      ["\u05E4\u05D5\u05E7\u05E1", ["fox", "fox home"]],
      // ── Utilities ──
      ["\u05D7\u05D1\u05E8\u05EA \u05D7\u05E9\u05DE\u05DC", ["\u05D7\u05D1' \u05D7\u05E9\u05DE\u05DC", "iec", "israel electric", "\u05D7\u05E9\u05DE\u05DC \u05D9\u05E9\u05E8\u05D0\u05DC"]],
      ["\u05D1\u05D6\u05E7", ["bezeq", "bezeq international", "\u05D1\u05D6\u05E7 \u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9"]],
      // ─────────────────────────────────────────────────────────────────────
      // Branch/spelling aliases for the Israeli-merchant seed (categories live
      // in the DB `merchant_category_votes`). These only collapse a messy
      // description like "טיב טעם רעננה" → canonical "טיב טעם" so the DB rule
      // keyed on the canonical can fire. Identity normalization only — NOT a
      // category list.
      // ── Supermarkets ──
      ["\u05D8\u05D9\u05D1 \u05D8\u05E2\u05DD", ["\u05D8\u05D9\u05D1-\u05D8\u05E2\u05DD", "tiv taam"]],
      ["\u05D9\u05D9\u05E0\u05D5\u05EA \u05D1\u05D9\u05EA\u05DF", ["\u05D9\u05D9\u05E0\u05D5\u05EA-\u05D1\u05D9\u05EA\u05DF"]],
      ["\u05DE\u05D2\u05D4 \u05D1\u05E2\u05D9\u05E8", ["\u05DE\u05D2\u05D4 \u05D1.\u05E2\u05D9\u05E8"]],
      ["\u05E7\u05E8\u05E4\u05D5\u05E8", ["carrefour", "\u05E7\u05E8\u05E4\u05D5\u05E8 \u05E1\u05D9\u05D8\u05D9", "\u05D4\u05D9\u05E4\u05E8 \u05E7\u05E8\u05E4\u05D5\u05E8", "\u05E7\u05E8\u05E4\u05D5\u05E8 \u05DE\u05E8\u05E7\u05D8", "\u05E7\u05E8\u05E4\u05D5\u05E8 \u05D0\u05D5\u05E0\u05DC\u05D9\u05D9\u05DF"]],
      ["\u05DE\u05D7\u05E1\u05E0\u05D9 \u05D4\u05E9\u05D5\u05E7", ["\u05DE\u05D7\u05E1\u05E0\u05D9-\u05D4\u05E9\u05D5\u05E7"]],
      ["\u05D7\u05E6\u05D9 \u05D7\u05D9\u05E0\u05DD", ["\u05D7\u05E6\u05D9-\u05D7\u05D9\u05E0\u05DD"]],
      ["\u05E0\u05EA\u05D9\u05D1 \u05D4\u05D7\u05E1\u05D3", ["\u05E0\u05EA\u05D9\u05D1-\u05D4\u05D7\u05E1\u05D3"]],
      ["\u05E1\u05D9\u05D8\u05D9 \u05DE\u05E8\u05E7\u05D8", ["city market"]],
      ["am pm", ["am:pm", "ampm", "\u05D0.\u05DE \u05E4.\u05DE"]],
      ["\u05E7\u05D5\u05E4\u05D9\u05E7\u05E1", ["cofix", "\u05E7\u05D5\u05E4\u05D9\u05E7\u05E1 \u05DE\u05E8\u05E7\u05D8"]],
      // ── Pharmacy / health ──
      ["\u05E0\u05D9\u05D5 \u05E4\u05D0\u05E8\u05DD", ["new pharm", "new-pharm", "\u05E0\u05D9\u05D5\u05E4\u05D0\u05E8\u05DD"]],
      ["\u05D2\u05D5\u05D3 \u05E4\u05D0\u05E8\u05DD", ["good pharm", "\u05D2\u05D5\u05D3-\u05E4\u05D0\u05E8\u05DD"]],
      ["\u05DE\u05D0\u05D5\u05D7\u05D3\u05EA", ["\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA \u05DE\u05D0\u05D5\u05D7\u05D3\u05EA", "\u05E7\u05D5\u05E4\u05EA \u05D7\u05D5\u05DC\u05D9\u05DD \u05DE\u05D0\u05D5\u05D7\u05D3\u05EA"]],
      ["\u05DC\u05D0\u05D5\u05DE\u05D9\u05EA", ["\u05DC\u05D0\u05D5\u05DE\u05D9\u05EA \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA", "\u05E7\u05D5\u05E4\u05EA \u05D7\u05D5\u05DC\u05D9\u05DD \u05DC\u05D0\u05D5\u05DE\u05D9\u05EA"]],
      ["\u05D0\u05D5\u05E4\u05D8\u05D9\u05E7\u05E0\u05D4", ["optikana"]],
      // ── Fuel / transport ──
      ["\u05D8\u05DF", ["ten \u05D3\u05DC\u05E7", "\u05EA\u05D7\u05E0\u05EA \u05D8\u05DF"]],
      ["\u05E4\u05E0\u05D2\u05D5", ["pango"]],
      ["\u05E1\u05DC\u05D5\u05E4\u05D0\u05E8\u05E7", ["cellopark", "\u05E1\u05DC\u05D5 \u05E4\u05D0\u05E8\u05E7"]],
      ["\u05E8\u05D1 \u05E7\u05D1", ["rav kav", "\u05E8\u05D1-\u05E7\u05D5", "\u05E8\u05D1 \u05E7\u05D5", "ravkav"]],
      ["\u05E8\u05DB\u05D1\u05EA \u05D9\u05E9\u05E8\u05D0\u05DC", ["israel railways", "rakevet"]],
      ["\u05D2\u05D8", ["gett", "get taxi", "\u05D2\u05D8 \u05D8\u05E7\u05E1\u05D9"]],
      ["\u05D9\u05D0\u05E0\u05D2\u05D5", ["yango"]],
      ["\u05DE\u05D5\u05D1\u05D9\u05D8", ["moovit"]],
      // ── Telecom ──
      ["\u05E4\u05E8\u05D8\u05E0\u05E8", ["partner", "partner tv", "\u05E4\u05E8\u05D8\u05E0\u05E8 tv"]],
      ["\u05E1\u05DC\u05E7\u05D5\u05DD", ["cellcom", "\u05E1\u05DC\u05E7\u05D5\u05DD tv", "cellcom tv"]],
      ["\u05E4\u05DC\u05D0\u05E4\u05D5\u05DF", ["pelephone"]],
      ["\u05D4\u05D5\u05D8", ["hot mobile", "\u05D4\u05D5\u05D8 \u05DE\u05D5\u05D1\u05D9\u05D9\u05DC"]],
      ["\u05D9\u05E1", ["yesdbs", "yes dbs"]],
      ["\u05D2\u05D5\u05DC\u05DF \u05D8\u05DC\u05E7\u05D5\u05DD", ["golan telecom"]],
      ["\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05EA\u05E7\u05E9\u05D5\u05E8\u05EA", ["rami levy communications"]],
      ["\u05DE\u05D9 \u05D0\u05D1\u05D9\u05D1\u05D9\u05DD", ["\u05DE\u05D9-\u05D0\u05D1\u05D9\u05D1\u05D9\u05DD"]],
      // ── Cafes / restaurants / delivery ──
      ["\u05E7\u05E4\u05D4 \u05E7\u05E4\u05D4", ["cafe cafe", "\u05E7\u05E4\u05D4-\u05E7\u05E4\u05D4"]],
      ["\u05E7\u05E4\u05D4 \u05D2\u05E8\u05D2", ["greg", "\u05D2\u05E8\u05D2", "cafe greg"]],
      ["\u05E7\u05E4\u05D4 \u05D2'\u05D5", ["cafe joe", "\u05E7\u05E4\u05D4 \u05D2\u05D5"]],
      ["\u05E8\u05D5\u05DC\u05D3\u05D9\u05DF", ["roladin"]],
      ["\u05D1\u05D5\u05E8\u05D2\u05E8 \u05E7\u05D9\u05E0\u05D2", ["burger king"]],
      ["\u05D1\u05D5\u05E8\u05D2\u05E8\u05D0\u05E0\u05E5'", ["burgeranch", "\u05D1\u05D5\u05E8\u05D2\u05E8 \u05E8\u05D0\u05E0\u05E5'", "\u05D1\u05D5\u05E8\u05D2\u05E8\u05E8\u05D0\u05E0\u05E5"]],
      ["\u05D3\u05D5\u05DE\u05D9\u05E0\u05D5\u05E1", ["domino's", "dominos", "\u05D3\u05D5\u05DE\u05D9\u05E0\u05D5'\u05E1"]],
      ["\u05E4\u05D9\u05E6\u05D4 \u05D4\u05D0\u05D8", ["pizza hut"]],
      ["\u05D5\u05D5\u05DC\u05D8", ["wolt"]],
      ["\u05EA\u05DF \u05D1\u05D9\u05E1", ["10bis", "tenbis", "\u05EA\u05DF-\u05D1\u05D9\u05E1", "10 bis"]],
      ["\u05DE\u05E7\u05E1 \u05D1\u05E8\u05E0\u05E8", ["max brenner"]],
      ["\u05DC\u05D7\u05DD \u05D0\u05E8\u05D6", ["lehem erez"]],
      // ── Fashion / retail / electronics ──
      ["\u05E7\u05E1\u05D8\u05E8\u05D5", ["castro"]],
      ["\u05E8\u05E0\u05D5\u05D0\u05E8", ["renuar", "twentyfourseven", "24/7"]],
      ["\u05D2\u05D5\u05DC\u05E3", ["golf & co", "golf and co", "\u05D2\u05D5\u05DC\u05E3 \u05D0\u05E0\u05D3 \u05E7\u05D5"]],
      ["\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05D9\u05D2\u05DC", ["american eagle"]],
      ["\u05E4\u05D5\u05DC \u05D0\u05E0\u05D3 \u05D1\u05E8", ["pull & bear", "pull and bear"]],
      ["\u05D1\u05E8\u05E9\u05E7\u05D4", ["bershka"]],
      ["\u05DE\u05E0\u05D2\u05D5", ["mango"]],
      ["\u05D8\u05E8\u05DE\u05D9\u05E0\u05DC \u05D0\u05D9\u05E7\u05E1", ["terminalx", "terminal x", "\u05D8\u05E8\u05DE\u05D9\u05E0\u05DC x"]],
      ["\u05D3\u05DC\u05EA\u05D0", ["delta israel"]],
      ["\u05E0\u05D9\u05D9\u05E7\u05D9", ["nike"]],
      ["\u05D0\u05D3\u05D9\u05D3\u05E1", ["adidas"]],
      ["\u05E9\u05D9\u05D9\u05DF", ["shein"]],
      ["\u05E2\u05DC\u05D9 \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1", ["aliexpress", "ali express"]],
      ["\u05D0\u05D9\u05E7\u05D0\u05D4", ["ikea"]],
      ["\u05D4\u05D5\u05DD \u05E1\u05E0\u05D8\u05E8", ["home center"]],
      ["\u05D0\u05D9\u05D9\u05E1", ["ace hardware"]],
      ["\u05DE\u05E7\u05E1 \u05E1\u05D8\u05D5\u05E7", ["max stock", "maxstock"]],
      ["\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8", ["\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8 \u05DC\u05E6\u05E8\u05DB\u05DF", "hamashbir"]],
      ["ksp", ["\u05E7.\u05E1.\u05E4"]],
      ["\u05D1\u05D0\u05D2", ["bug"]],
      ["\u05D0\u05D9\u05D5\u05D5\u05E8\u05D9", ["ivory"]],
      ["\u05DE\u05D7\u05E1\u05E0\u05D9 \u05D7\u05E9\u05DE\u05DC", ["\u05DE\u05D7\u05E1\u05E0\u05D9-\u05D7\u05E9\u05DE\u05DC", "payngo", "\u05E4\u05D9\u05D9\u05E0\u05D2\u05D5"]],
      ["\u05E9\u05E7\u05DD \u05D0\u05DC\u05E7\u05D8\u05E8\u05D9\u05E7", ["shekem electric", "\u05E9\u05E7\u05DD-\u05D0\u05DC\u05E7\u05D8\u05E8\u05D9\u05E7"]],
      ["\u05E1\u05D8\u05D9\u05DE\u05E6\u05E7\u05D9", ["steimatzky"]],
      ["\u05E6\u05D5\u05DE\u05EA \u05E1\u05E4\u05E8\u05D9\u05DD", ["tsomet sfarim"]],
      // ── Investment houses / provident & mutual funds (appear as "קניה/X/אינטרנט") ──
      ["\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8 \u05E9\u05D7\u05DD", ["altshuler", "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8", "altshuler shaham"]],
      ["\u05D9\u05DC\u05D9\u05DF \u05DC\u05E4\u05D9\u05D3\u05D5\u05EA", ["yelin lapidot", "\u05D9\u05DC\u05D9\u05DF-\u05DC\u05E4\u05D9\u05D3\u05D5\u05EA", "yelin"]],
      ["\u05DE\u05D9\u05D8\u05D1", ["meitav", "\u05DE\u05D9\u05D8\u05D1 \u05D3\u05E9", "\u05DE\u05D9\u05D8\u05D1 \u05D8\u05E8\u05D9\u05D9\u05D3", "meitav dash"]],
      ["\u05E4\u05E1\u05D2\u05D5\u05EA", ["psagot"]],
      ["\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8", ["analyst \u05D1\u05D9\u05EA \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA", "\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8 \u05D1\u05D9\u05EA \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA"]],
      ["\u05DE\u05D5\u05E8 \u05D2\u05DE\u05DC", ["\u05DE\u05D5\u05E8 \u05D1\u05D9\u05EA \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA", "\u05DE\u05D5\u05E8 \u05E7\u05D5\u05E4\u05D5\u05EA", "\u05DE\u05D5\u05E8 \u05E4\u05E0\u05E1\u05D9\u05D4", "\u05DE\u05D5\u05E8 \u05D2\u05DE\u05DC", "\u05DE\u05D5\u05E8 \u05EA\u05D9\u05E7\u05D9\u05DD"]],
      // ── Leisure / fitness / cinema ──
      ["\u05D4\u05D5\u05DC\u05DE\u05E1 \u05E4\u05DC\u05D9\u05D9\u05E1", ["holmes place"]],
      ["\u05D2\u05D5 \u05D0\u05E7\u05D8\u05D9\u05D1", ["go active", "goactive"]],
      ["\u05E1\u05D9\u05E0\u05DE\u05D4 \u05E1\u05D9\u05D8\u05D9", ["cinema city"]],
      ["\u05D9\u05E1 \u05E4\u05DC\u05D0\u05E0\u05D8", ["yes planet"]],
      ["\u05E8\u05D1 \u05D7\u05DF", ["rav hen", "rav-hen"]]
    ];
  }
});

// ../lib/doc-parser/merchant-category-rules.ts
function cleanText(value) {
  return value.replace(/["\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}
function normalizeRule(item) {
  if (typeof item !== "object" || item === null) return null;
  const row = item;
  const merchantKey = cleanText(typeof row.merchantKey === "string" ? row.merchantKey : String(row.merchant_key || ""));
  const categoryKey = cleanText(typeof row.categoryKey === "string" ? row.categoryKey : String(row.category_key || ""));
  const count = Number(row.count);
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : typeof row.updated_at === "string" ? row.updated_at : (/* @__PURE__ */ new Date(0)).toISOString();
  const firstSeenAt = typeof row.firstSeenAt === "string" ? row.firstSeenAt : typeof row.first_seen_at === "string" ? row.first_seen_at : void 0;
  const sampleDescription = typeof row.sampleDescription === "string" ? row.sampleDescription : typeof row.sample_description === "string" ? row.sample_description : void 0;
  if (!merchantKey || !categoryKey || !Number.isFinite(count)) return null;
  return {
    merchantKey: merchantKey.toLowerCase(),
    categoryKey: categoryKey.toLowerCase(),
    count,
    firstSeenAt,
    updatedAt,
    sampleDescription
  };
}
function cloneRules(rules) {
  return rules.map((rule) => ({ ...rule }));
}
function readRulesFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRule).filter(Boolean);
  } catch {
    return [];
  }
}
function writeRulesToStorage(rules) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(rules));
  } catch (e) {
    reportError("doc-parser/merchant-category-rules", e);
  }
}
function dispatchRulesUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MERCHANT_RULES_EVENT));
}
function setCache(rules, persist = true) {
  const normalized = rules.map(normalizeRule).filter(Boolean);
  merchantRulesCache = cloneRules(normalized);
  if (persist) writeRulesToStorage(merchantRulesCache);
  dispatchRulesUpdated();
  return cloneRules(merchantRulesCache);
}
function getCachedRules() {
  if (merchantRulesCache) return cloneRules(merchantRulesCache);
  const stored = readRulesFromStorage();
  merchantRulesCache = cloneRules(stored);
  return cloneRules(merchantRulesCache);
}
function getMerchantKey(description) {
  const raw = cleanText(description || "");
  if (!raw) return "_unknown_";
  const bitRecipient = extractBitRecipient(raw);
  if (bitRecipient) {
    const recipient = cleanText(bitRecipient).toLowerCase();
    return recipient ? `bit:${recipient}` : "_unknown_";
  }
  const normalized = cleanText(normalizeSupplier(raw)).toLowerCase();
  return normalized || "_unknown_";
}
function setMerchantCategoryRulesCache(rules, persist = true) {
  return setCache(rules, persist);
}
function findMerchantCategoryRule(description, rules = getCachedRules()) {
  const merchantKey = getMerchantKey(description);
  return rules.find((rule) => rule.merchantKey === merchantKey) || null;
}
var STORAGE_KEY, MERCHANT_RULES_EVENT, merchantRulesCache;
var init_merchant_category_rules = __esm({
  "../lib/doc-parser/merchant-category-rules.ts"() {
    "use strict";
    init_client_scope();
    init_normalizer();
    init_report_error();
    STORAGE_KEY = "verdant:merchant_category_rules";
    MERCHANT_RULES_EVENT = "verdant:merchant_category_rules:updated";
    merchantRulesCache = null;
  }
});

// ../lib/doc-parser/categorizer.ts
function loadOverrides() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(scopedKey(OVERRIDES_KEY)) || "[]");
  } catch {
    return [];
  }
}
function categorize(description) {
  const lower = description.toLowerCase().replace(/["\u200F\u200E]/g, "");
  const stripped = lower.replace(/^הוראת?\s*קבע\s*(ל|מ|עבור)?\s*/i, "").replace(/^הו"?ק\s*/i, "").replace(/^מס"?ב\s*/i, "").replace(/^ה[\.']?ק\s*/i, "").replace(/^חיוב\s*אשראי\s*/i, "").replace(/^תשלום\s*(ל|מ|עבור)?\s*/i, "").replace(/^הפקדת?\s*(ל|מ)?\s*/i, "").replace(/^משיכת?\s*/i, "").replace(/^העברת?\s*(ב|ל|מ)?\s*/i, "").trim();
  const searchTexts = stripped !== lower ? [lower, stripped] : [lower];
  const overrides = loadOverrides();
  const sorted = [...overrides].sort(
    (a, b) => b.pattern.length - a.pattern.length || b.count - a.count
  );
  const candidateBitRecipient = extractBitRecipient(description);
  for (const ov of sorted) {
    if (ov.pattern.startsWith(BIT_PATTERN_PREFIX)) {
      if (!candidateBitRecipient) continue;
      const learnedRecipient = ov.pattern.slice(BIT_PATTERN_PREFIX.length);
      const candidateLow = candidateBitRecipient.toLowerCase();
      if (!candidateLow.includes(learnedRecipient)) continue;
      const cat = CATEGORIES.find((c) => c.key === ov.category);
      if (cat) return { key: cat.key, label: cat.label, confidence: 1 };
      continue;
    }
    for (const text of searchTexts) {
      if (text.includes(ov.pattern)) {
        const cat = CATEGORIES.find((c) => c.key === ov.category);
        if (cat) return { key: cat.key, label: cat.label, confidence: 1 };
      }
    }
  }
  const merchantRule = findMerchantCategoryRule(description);
  if (merchantRule) {
    const cat = CATEGORIES.find((c) => c.key === merchantRule.categoryKey);
    if (cat) return { key: cat.key, label: cat.label, confidence: 1 };
  }
  let bestCat = null;
  let bestLen = 0;
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      const kwLow = kw.toLowerCase();
      for (const text of searchTexts) {
        if (text.includes(kwLow) && kwLow.length > bestLen) {
          bestLen = kwLow.length;
          bestCat = { key: cat.key, label: cat.label };
        }
      }
    }
  }
  if (bestCat) {
    const conf = bestLen >= 6 ? 0.9 : 0.7;
    return { ...bestCat, confidence: conf };
  }
  for (const cat of CATEGORIES) {
    if (cat.patterns) {
      for (const rx of cat.patterns) {
        for (const text of searchTexts) {
          if (rx.test(text)) {
            return { key: cat.key, label: cat.label, confidence: 0.5 };
          }
        }
      }
    }
  }
  return { key: "other", label: "\u05D0\u05D7\u05E8", confidence: 0 };
}
var CATEGORIES, OVERRIDES_KEY, BIT_PATTERN_PREFIX;
var init_categorizer = __esm({
  "../lib/doc-parser/categorizer.ts"() {
    "use strict";
    init_client_scope();
    init_normalizer();
    init_merchant_category_rules();
    CATEGORIES = [
      {
        key: "food",
        label: "\u05DE\u05D6\u05D5\u05DF \u05D5\u05E6\u05E8\u05D9\u05DB\u05D4",
        icon: "shopping_cart",
        color: "#2B694D",
        keywords: [
          // ── Supermarket chains ──
          "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC",
          "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9",
          "\u05DE\u05D2\u05D4",
          "\u05DE\u05D2\u05D4 \u05D1\u05E2\u05D9\u05E8",
          "\u05DE\u05D2\u05D4 \u05D1\u05D5\u05DC",
          "\u05D9\u05D5\u05D7\u05E0\u05E0\u05D5\u05E3",
          "\u05D7\u05E6\u05D9 \u05D7\u05D9\u05E0\u05DD",
          "\u05D0\u05D5\u05E9\u05E8 \u05E2\u05D3",
          "\u05D8\u05D9\u05D1 \u05D8\u05E2\u05DD",
          "\u05D5\u05D9\u05E7\u05D8\u05D5\u05E8\u05D9",
          "\u05E1\u05D5\u05E4\u05E8 \u05E1\u05D5\u05DC",
          "\u05E4\u05E8\u05E9 \u05DE\u05E8\u05E7\u05D8",
          "\u05E1\u05D5\u05E4\u05E8 \u05D1\u05E8\u05E7\u05EA",
          "\u05D6\u05D5\u05DC \u05D5\u05D1\u05D2\u05D3\u05D5\u05DC",
          "\u05DE\u05D7\u05E1\u05E0\u05D9 \u05D4\u05E9\u05D5\u05E7",
          "\u05E1\u05D5\u05E4\u05E8 \u05D3\u05D5\u05E9",
          "\u05E7\u05D9\u05E0\u05D2 \u05E1\u05D8\u05D5\u05E8",
          "\u05E9\u05D5\u05E7",
          "\u05DE\u05DB\u05D5\u05DC\u05EA",
          "\u05D9\u05E8\u05E7\u05D5\u05EA",
          "\u05E4\u05D9\u05E8\u05D5\u05EA",
          // ── Convenience ──
          "am:pm",
          "yellow",
          "\u05E0\u05E2\u05DE\u05DF",
          "\u05DB\u05DC \u05D1\u05D5",
          // ── Producers / wholesale ──
          "\u05EA\u05E0\u05D5\u05D1\u05D4",
          "\u05D8\u05E8\u05D4",
          "\u05E9\u05D8\u05E8\u05D0\u05D5\u05E1",
          "\u05D0\u05E1\u05DD",
          "\u05E2\u05DC\u05D9\u05EA",
          // ── Bakeries ──
          "\u05DE\u05D0\u05E4\u05D9\u05D9\u05D4",
          "\u05DC\u05D7\u05DD \u05D0\u05E8\u05D6",
          "\u05D0\u05E0\u05D2\u05DC\u05E1",
          "\u05E8\u05D5\u05DC\u05D3\u05D9\u05DF",
          "\u05E4\u05EA \u05D1\u05D2\u05DC\u05D9\u05DC",
          "\u05DC\u05D7\u05DE\u05E0\u05D9\u05E0\u05D4",
          "\u05D1\u05D9\u05D9\u05D2\u05DC",
          // ── Online grocery ──
          "\u05DE\u05E9\u05DC\u05D5\u05D7 \u05E9\u05D5\u05E4\u05E8\u05E1\u05DC",
          "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05D0\u05D5\u05E0\u05DC\u05D9\u05D9\u05DF",
          // ── Markets ──
          "\u05E9\u05D5\u05E7 \u05D4\u05DB\u05E8\u05DE\u05DC",
          "\u05E9\u05D5\u05E7 \u05DE\u05D7\u05E0\u05D4 \u05D9\u05D4\u05D5\u05D3\u05D4",
          // Note: delivery apps (wolt, ten bis, cibus) → dining_out category
          // Note: סופר-פארם / pharmacy moved to "health" category
          // ── Cleaning / household ──
          "\u05E0\u05D9\u05E7\u05D9\u05D5\u05DF",
          "\u05DE\u05E8\u05E7\u05D7\u05EA"
        ],
        patterns: [/סופר(?!\s*פארם)(?!\-פארם)/i]
      },
      {
        key: "housing",
        label: "\u05D3\u05D9\u05D5\u05E8 \u05D5\u05DE\u05D2\u05D5\u05E8\u05D9\u05DD",
        icon: "home",
        color: "#1B4332",
        keywords: [
          "\u05DE\u05E9\u05DB\u05E0\u05EA\u05D0",
          "\u05E9\u05DB\u05D9\u05E8\u05D5\u05EA",
          '\u05E9\u05DB"\u05D3',
          "\u05D0\u05E8\u05E0\u05D5\u05E0\u05D4",
          "\u05D5\u05E2\u05D3 \u05D1\u05D9\u05EA",
          "\u05D5\u05E2\u05D3 \u05D4\u05D1\u05D9\u05EA",
          "\u05D1\u05E0\u05E7 \u05D0\u05D3\u05E0\u05D9\u05DD",
          "\u05E2\u05DE\u05D9\u05D3\u05E8",
          "\u05D3\u05D9\u05E8\u05D4",
          "\u05E9\u05D9\u05E4\u05D5\u05E5",
          "\u05E7\u05D1\u05DC\u05DF",
          "\u05DE\u05D9 \u05D0\u05D1\u05D9\u05D1\u05D9\u05DD",
          "\u05DE\u05D9 \u05E9\u05D1\u05E2",
          "\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05DE\u05D9\u05DD",
          "\u05D2\u05D9\u05D7\u05D5\u05DF",
          "\u05DE\u05D9 \u05DB\u05E8\u05DE\u05DC",
          "\u05DE\u05D9 \u05D3\u05DF",
          "\u05DE\u05D9 \u05E2\u05E4\u05D5\u05DC\u05D4",
          "\u05DE\u05D9 \u05E8\u05DE\u05EA \u05D2\u05DF",
          "\u05D7\u05D1\u05E8\u05EA \u05D7\u05E9\u05DE\u05DC",
          "\u05D7\u05D1' \u05D7\u05E9\u05DE\u05DC",
          "iec",
          "israel electric",
          "\u05D2\u05D6",
          "\u05D0\u05DE\u05D9\u05E9\u05E8\u05D0\u05D2\u05D6",
          "\u05E1\u05D5\u05E4\u05E8\u05D2\u05D6",
          "\u05E4\u05D6\u05D2\u05D6"
        ]
      },
      {
        key: "transport",
        label: "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05D5\u05E8\u05DB\u05D1",
        icon: "directions_car",
        color: "#3b82f6",
        keywords: [
          // ── Gas stations ──
          "\u05E4\u05D6",
          "\u05D3\u05DC\u05E7",
          "\u05E1\u05D5\u05E0\u05D5\u05DC",
          "\u05D3\u05D5\u05E8 \u05D0\u05DC\u05D5\u05DF",
          "ten",
          "\u05D0\u05DC\u05D5\u05DF",
          "\u05D3\u05DC\u05E7 \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4",
          "\u05EA\u05E2\u05DD+",
          // ── Parking ──
          "\u05D7\u05E0\u05D9\u05D4",
          "\u05D7\u05E0\u05D9\u05D5\u05DF",
          "\u05E4\u05E0\u05D2\u05D5",
          "\u05E1\u05DC\u05D5\u05E4\u05D0\u05E8\u05E7",
          "cellopark",
          // ── Public transport ──
          "\u05D0\u05D2\u05D3",
          "\u05D3\u05DF",
          "\u05E8\u05DB\u05D1\u05EA \u05D9\u05E9\u05E8\u05D0\u05DC",
          "\u05E8\u05DB\u05D1\u05EA",
          "\u05E7\u05D5 \u05E7\u05D5\u05D5\u05D9\u05DD",
          "\u05DE\u05D8\u05E8\u05D5\u05E4\u05D5\u05DC\u05D9\u05DF",
          "\u05E8\u05D1 \u05E7\u05D5",
          "rav kav",
          "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA",
          "\u05E0\u05EA\u05D9\u05D1\u05D9 \u05D0\u05D9\u05D9\u05DC\u05D5\u05DF",
          // ── Taxis / ride-sharing ──
          "\u05DE\u05D5\u05E0\u05D9\u05EA",
          "gett",
          "\u05D2\u05D8 \u05D8\u05E7\u05E1\u05D9",
          "yango",
          "\u05D9\u05D0\u05E0\u05D2\u05D5",
          "uber",
          // ── Vehicle ──
          "\u05D8\u05E1\u05D8",
          "\u05E8\u05D9\u05E9\u05D5\u05D9",
          "\u05D0\u05D2\u05E8\u05EA \u05E8\u05D9\u05E9\u05D5\u05D9",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05E8\u05DB\u05D1",
          "\u05DE\u05D5\u05E1\u05DA",
          "\u05E6\u05DE\u05D9\u05D2\u05D9\u05DD",
          "\u05E9\u05DE\u05DF \u05DE\u05E0\u05D5\u05E2",
          "\u05E9\u05D8\u05D9\u05E4\u05EA \u05E8\u05DB\u05D1",
          // ── Car rental / sharing ──
          "\u05D0\u05DC\u05D3\u05DF",
          "\u05E9\u05DC\u05DE\u05D4 \u05E1\u05D9\u05E7\u05E1\u05D8",
          "hertz",
          "avis",
          "budget",
          "car2go",
          "\u05D0\u05D5\u05D8\u05D5\u05EA\u05DC",
          "\u05E1\u05D9\u05E7\u05E1\u05D8",
          // ── E-scooters / bikes ──
          "\u05DC\u05D9\u05D9\u05DD",
          "lime",
          "bird",
          "wind",
          // ── Tolls ──
          "\u05DB\u05D1\u05D9\u05E9 6",
          "\u05DB\u05D1\u05D9\u05E9 6 \u05D7\u05D5\u05E6\u05D4",
          "\u05D3\u05E8\u05DA \u05D0\u05E8\u05E5"
        ],
        patterns: [/תדלוק|דלק\s/i, /חני(ה|ון)\s/i]
      },
      {
        key: "utilities",
        label: "\u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05E9\u05D5\u05D8\u05E4\u05D9\u05DD",
        icon: "bolt",
        color: "#f59e0b",
        keywords: [
          "\u05D7\u05E9\u05DE\u05DC",
          "\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA",
          "\u05DE\u05D9\u05DD",
          "\u05D2\u05D6",
          "\u05E2\u05D9\u05E8\u05D9\u05D9\u05EA",
          "\u05E2\u05D9\u05E8\u05D9\u05D9\u05D4",
          "\u05D1\u05D6\u05E7",
          "\u05E4\u05E8\u05D8\u05E0\u05E8",
          "\u05E1\u05DC\u05E7\u05D5\u05DD",
          "\u05D4\u05D5\u05D8",
          "cellcom",
          "012",
          "013",
          "bezeq",
          "hot net",
          "\u05D4\u05D5\u05D8 \u05DE\u05D5\u05D1\u05D9\u05D9\u05DC",
          "yes",
          "\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8",
          "\u05E1\u05DC\u05D5\u05DC\u05E8",
          "\u05D2\u05D5\u05DC\u05DF \u05D8\u05DC\u05E7\u05D5\u05DD",
          "\u05E4\u05DC\u05D0\u05E4\u05D5\u05DF",
          "012 mobile",
          "we4g",
          "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05EA\u05E7\u05E9\u05D5\u05E8\u05EA",
          "\u05D4\u05D5\u05D8 \u05DE\u05D5\u05D1\u05D9\u05D9\u05DC",
          "019",
          "xfone",
          "\u05D0\u05E7\u05E1\u05E4\u05D5\u05DF",
          "youphone"
        ],
        patterns: [/מי\s*(אביבים|שבע|גיחון|כרמל|עפולה|דן|רמת\s*גן)/i]
      },
      {
        key: "health",
        label: "\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA",
        icon: "local_hospital",
        color: "#ef4444",
        keywords: [
          // ── Health funds ──
          "\u05DE\u05DB\u05D1\u05D9",
          "\u05DB\u05DC\u05DC\u05D9\u05EA",
          "\u05DE\u05D0\u05D5\u05D7\u05D3\u05EA",
          "\u05DC\u05D0\u05D5\u05DE\u05D9\u05EA",
          // ── Pharmacy ──
          "\u05E1\u05D5\u05E4\u05E8-\u05E4\u05D0\u05E8\u05DD",
          "\u05E1\u05D5\u05E4\u05E8 \u05E4\u05D0\u05E8\u05DD",
          "super pharm",
          "super-pharm",
          "good pharm",
          "\u05E4\u05D0\u05E8\u05DD",
          "\u05D1\u05D9\u05EA \u05DE\u05E8\u05E7\u05D7\u05EA",
          // ── Medical ──
          "\u05E8\u05E4\u05D5\u05D0\u05D4",
          "\u05E8\u05D5\u05E4\u05D0",
          "\u05D1\u05D9\u05EA \u05D7\u05D5\u05DC\u05D9\u05DD",
          "\u05DE\u05E8\u05E4\u05D0\u05D4",
          '\u05E8\u05DE\u05D1"\u05DD',
          "\u05D0\u05D9\u05DB\u05D9\u05DC\u05D5\u05D1",
          "\u05E9\u05D9\u05D1\u05D0",
          "\u05D4\u05D3\u05E1\u05D4",
          "\u05E1\u05D5\u05E8\u05D5\u05E7\u05D4",
          "\u05D0\u05E1\u05E3 \u05D4\u05E8\u05D5\u05E4\u05D0",
          "\u05E9\u05E0\u05D9\u05D9\u05D3\u05E8",
          "\u05D5\u05D5\u05DC\u05E4\u05E1\u05D5\u05DF",
          "\u05D1\u05DC\u05D9\u05E0\u05E1\u05D5\u05DF",
          "\u05DE\u05D0\u05D9\u05E8",
          // ── Specific treatments ──
          "\u05E9\u05D9\u05E0\u05D9\u05D9\u05DD",
          "\u05D0\u05D5\u05E4\u05D8\u05D9\u05E7\u05D4",
          "\u05E2\u05D9\u05E0\u05D9\u05D9\u05DD",
          "\u05D8\u05D9\u05E4\u05D5\u05DC",
          "\u05EA\u05E8\u05D5\u05E4\u05D5\u05EA",
          "\u05E4\u05D9\u05D6\u05D9\u05D5\u05EA\u05E8\u05E4\u05D9\u05D4",
          "\u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2",
          "\u05D3\u05D9\u05D0\u05D8\u05E0\u05D9\u05EA",
          "\u05E7\u05DC\u05D9\u05E0\u05D0\u05D9\u05EA"
        ]
      },
      {
        key: "education",
        label: "\u05D7\u05D9\u05E0\u05D5\u05DA \u05D5\u05D9\u05DC\u05D3\u05D9\u05DD",
        icon: "school",
        color: "#2B694D",
        keywords: [
          "\u05D2\u05DF \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05D2\u05DF",
          "\u05D1\u05D9\u05EA \u05E1\u05E4\u05E8",
          "\u05D7\u05D5\u05D2",
          "\u05E9\u05D9\u05E2\u05D5\u05E8",
          "\u05D0\u05D5\u05E0\u05D9\u05D1\u05E8\u05E1\u05D9\u05D8\u05D4",
          "\u05DE\u05DB\u05DC\u05DC\u05D4",
          "\u05E7\u05D5\u05E8\u05E1",
          "\u05EA\u05DC\u05DE\u05D5\u05D3",
          "\u05E6\u05D4\u05E8\u05D5\u05DF",
          "\u05E7\u05D9\u05D9\u05D8\u05E0\u05D4",
          "\u05E9\u05DB\u05E8 \u05DC\u05D9\u05DE\u05D5\u05D3",
          "\u05D4\u05E8\u05E9\u05DE\u05D4",
          "\u05DE\u05E2\u05D5\u05DF",
          "\u05D8\u05E8\u05D5\u05DD \u05D7\u05D5\u05D1\u05D4",
          "\u05DE\u05DB\u05D9\u05E0\u05D4",
          "\u05D1\u05D7\u05D9\u05E0\u05D4",
          // ── Music / arts ──
          "\u05E9\u05D9\u05E2\u05D5\u05E8\u05D9 \u05DE\u05D5\u05D6\u05D9\u05E7\u05D4",
          "\u05E7\u05D5\u05E0\u05E1\u05E8\u05D1\u05D8\u05D5\u05E8\u05D9\u05D5\u05DF",
          "\u05D7\u05D5\u05D2 \u05E6\u05D9\u05D5\u05E8",
          // ── Driving ──
          "\u05E9\u05D9\u05E2\u05D5\u05E8\u05D9 \u05E0\u05D4\u05D9\u05D2\u05D4",
          "\u05D1\u05D9\u05EA \u05E1\u05E4\u05E8 \u05DC\u05E0\u05D4\u05D9\u05D2\u05D4"
        ]
      },
      {
        key: "insurance",
        label: "\u05D1\u05D9\u05D8\u05D5\u05D7",
        icon: "shield",
        color: "#06b6d4",
        keywords: [
          "\u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05DE\u05D2\u05D3\u05DC",
          "\u05D4\u05E8\u05D0\u05DC",
          "\u05DB\u05DC\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1",
          "\u05DE\u05E0\u05D5\u05E8\u05D4",
          "\u05D0\u05D9\u05D9\u05DC\u05D5\u05DF",
          "\u05E9\u05DC\u05DE\u05D4 \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9",
          "\u05DE\u05D2\u05D3\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05D4\u05E8\u05D0\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1 \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D7\u05D9\u05D9\u05DD",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D3\u05D9\u05E8\u05D4",
          "\u05D1\u05D9\u05D8 \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05E4\u05E1\u05D2\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7",
          "\u05E9\u05D5\u05DE\u05E8\u05D4",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0"
        ]
      },
      {
        key: "leisure",
        label: "\u05E4\u05E0\u05D0\u05D9 \u05D5\u05D1\u05D9\u05D3\u05D5\u05E8",
        icon: "theater_comedy",
        color: "#ec4899",
        keywords: [
          // ── Parks / outdoors ──
          "\u05E4\u05D0\u05E8\u05E7",
          "\u05DC\u05D5\u05E0\u05D4 \u05E4\u05D0\u05E8\u05E7",
          "\u05E1\u05E4\u05D0\u05E8\u05D9",
          // ── Fitness ──
          "\u05E1\u05E4\u05D5\u05E8\u05D8",
          "\u05D7\u05D3\u05E8 \u05DB\u05D5\u05E9\u05E8",
          "\u05D4\u05D5\u05DC\u05DE\u05E1",
          "\u05D4\u05D5\u05DC\u05DE\u05E1 \u05E4\u05DC\u05D9\u05D9\u05E1",
          "\u05D2\u05D5 \u05D0\u05E7\u05D8\u05D9\u05D1",
          "\u05E1\u05D8\u05D5\u05D3\u05D9\u05D5",
          // ── Streaming (also in subscriptions) ──
          "\u05E0\u05D8\u05E4\u05DC\u05D9\u05E7\u05E1",
          "netflix",
          "\u05E1\u05E4\u05D5\u05D8\u05D9\u05E4\u05D9\u05D9",
          "spotify",
          "\u05D0\u05E4\u05DC \u05DE\u05D9\u05D5\u05D6\u05D9\u05E7",
          "apple music",
          "\u05D3\u05D9\u05E1\u05E0\u05D9",
          "disney",
          "hbo",
          "\u05D0\u05DE\u05D6\u05D5\u05DF \u05E4\u05E8\u05D9\u05D9\u05DD",
          "amazon prime"
        ]
      },
      {
        key: "shopping",
        label: "\u05E7\u05E0\u05D9\u05D5\u05EA",
        icon: "storefront",
        color: "#f97316",
        keywords: [
          // ── Home & furniture ──
          // NOTE: hardware / maintenance chains (הום סנטר, ace, הום דיפו)
          // moved to the "home_maintenance" category below.
          "\u05D0\u05D9\u05E7\u05D0\u05D4",
          "ikea",
          "\u05DB\u05D9\u05EA\u05DF",
          "\u05E8\u05D9\u05D4\u05D5\u05D8",
          "\u05DE\u05D9\u05DC\u05D2\u05DD",
          // ── Fashion ──
          "\u05D6\u05D0\u05E8\u05D4",
          "h&m",
          "fox",
          "\u05D2\u05D5\u05DC\u05E3",
          "\u05E7\u05E1\u05D8\u05E8\u05D5",
          "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05D9\u05D2\u05DC",
          "\u05DE\u05E0\u05D2\u05D5",
          "\u05D8\u05E8\u05DE\u05D9\u05E0\u05DC x",
          "\u05E4\u05D5\u05DC\u05D5",
          "pull&bear",
          "bershka",
          "\u05E2\u05D3\u05D9\u05E7\u05D4",
          "\u05D4\u05D5\u05D3\u05D9\u05E1",
          "\u05E0\u05E2\u05DE\u05DF",
          "\u05E0\u05E2\u05DC\u05D9",
          // ── Online ──
          "\u05D0\u05DC\u05D9\u05D0\u05E7\u05E1\u05E4\u05E8\u05E1",
          "amazon",
          "shein",
          "\u05E9\u05D9\u05D9\u05DF",
          "aliexpress",
          "ebay",
          "iherb",
          "asos",
          // ── Department stores ──
          "\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8 \u05DC\u05E6\u05E8\u05DB\u05DF",
          "\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8",
          // ── Electronics ──
          "\u05D1\u05D0\u05D2",
          "bug",
          "\u05D0\u05D9\u05D9\u05D1\u05D5\u05E8\u05D9",
          "ivory",
          "ksp",
          "\u05DE\u05D7\u05E9\u05D1\u05D9\u05DD",
          "\u05D6\u05D0\u05E4",
          "\u05D3\u05D9\u05D2\u05D9\u05D8\u05DC",
          "apple store",
          "\u05D0\u05E4\u05DC \u05E1\u05D8\u05D5\u05E8",
          "\u05E1\u05DE\u05E1\u05D5\u05E0\u05D2",
          "samsung",
          "\u05DE\u05E2\u05D1\u05D3\u05D4",
          // ── Books / toys / gifts ──
          "\u05E9\u05D8\u05D9\u05D9\u05DE\u05E6\u05E7\u05D9",
          "steimatzky",
          "\u05E6\u05E2\u05E6\u05D5\u05E2\u05D9\u05DD",
          "\u05DC\u05D2\u05D5",
          "\u05E4\u05E8\u05D7\u05D9\u05DD",
          "\u05DE\u05EA\u05E0\u05D4",
          "\u05DE\u05EA\u05E0\u05D5\u05EA",
          // ── Beauty / cosmetics ──
          "\u05E1\u05D3\u05E8\u05D4",
          "sabon",
          "\u05E1\u05D1\u05D5\u05DF",
          "\u05DC\u05D0\u05D5\u05E7\u05E1\u05D9\u05D8\u05DF",
          "kiko",
          "\u05DE\u05D0\u05E7",
          "mac cosmetics",
          // ── Sporting goods ──
          "\u05D3\u05E7\u05D8\u05DC\u05D5\u05DF",
          "decathlon",
          "\u05D0\u05D9\u05E0\u05D8\u05E8\u05E1\u05E4\u05D5\u05E8\u05D8",
          // ── Pet shops ──
          "\u05D7\u05E0\u05D5\u05EA \u05D7\u05D9\u05D5\u05EA",
          "\u05E4\u05D8 \u05E9\u05D5\u05E4"
        ]
      },
      {
        key: "salary",
        label: "\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA",
        icon: "payments",
        color: "#2B694D",
        keywords: [
          "\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA",
          "\u05E9\u05DB\u05E8",
          "\u05D4\u05E2\u05D1\u05E8\u05D4 \u05DE\u05DE\u05E2\u05E1\u05D9\u05E7",
          "\u05DE\u05E2\u05D1\u05D9\u05D3",
          "\u05E9\u05DB\u05E8 \u05D7\u05D5\u05D3\u05E9",
          "\u05E9\u05DB\u05E8 \u05E2\u05D1\u05D5\u05D3\u05D4",
          "\u05E0\u05D8\u05D5",
          "\u05D1\u05E8\u05D5\u05D8\u05D5",
          "\u05E9\u05DB\u05E8 \u05D3\u05D9\u05E8\u05E7\u05D8\u05D5\u05E8\u05D9\u05DD",
          "\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC",
          "\u05EA\u05E9\u05DC\u05D5\u05DD \u05E2\u05D1\u05D5\u05E8 \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD",
          "\u05D4\u05DB\u05E0\u05E1\u05D4 \u05DE\u05E9\u05DB\u05D9\u05E8\u05D5\u05EA",
          "\u05D3\u05DE\u05D9 \u05E9\u05DB\u05D9\u05E8\u05D5\u05EA",
          '\u05E9\u05DB"\u05D3 \u05DE\u05E7\u05D1\u05DC',
          "\u05E7\u05E6\u05D1\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05E6\u05D1\u05D4",
          "\u05E7\u05E6\u05D1\u05EA \u05D6\u05E7\u05E0\u05D4",
          "\u05DE\u05E2\u05E0\u05E7 \u05E2\u05D1\u05D5\u05D3\u05D4",
          "\u05DE\u05E2\u05E0\u05E7 \u05DC\u05D9\u05D3\u05D4",
          "\u05DE\u05DC\u05D2\u05D4",
          "\u05D3\u05D9\u05D1\u05D9\u05D3\u05E0\u05D3",
          "\u05E8\u05D9\u05D1\u05D9\u05EA \u05D6\u05DB\u05D5\u05EA",
          "\u05D4\u05DB\u05E0\u05E1\u05D4 \u05DE\u05E8\u05D9\u05D1\u05D9\u05EA",
          "\u05E4\u05E8\u05D9\u05DC\u05E0\u05E1",
          "\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA",
          "\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA"
        ],
        patterns: [
          /משכ(ורת|ו׳|\.)/i,
          /שכר\s*(חודש|עבודה)/i,
          /העברה\s*(ממעסיק|מחברת|מעובד)/i,
          /קצבת?\s*(ילדים|זקנה|נכות|שאירים)/i,
          /מענק\s*(עבודה|לידה|הסתגלות)/i
        ]
      },
      {
        key: "pension",
        label: "\u05E4\u05E0\u05E1\u05D9\u05D4 \u05D5\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF",
        icon: "savings",
        color: "#1a6b42",
        keywords: [
          "\u05E4\u05E0\u05E1\u05D9\u05D4",
          "\u05D2\u05DE\u05DC",
          "\u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA",
          "\u05D4\u05E4\u05E8\u05E9\u05D4",
          "\u05E4\u05D9\u05E6\u05D5\u05D9\u05D9\u05DD",
          "\u05DE\u05D9\u05D8\u05D1 \u05D3\u05E9",
          "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8",
          "\u05DE\u05D5\u05E8",
          "\u05E4\u05E1\u05D2\u05D5\u05EA",
          "\u05DE\u05E0\u05D5\u05E8\u05D4 \u05E4\u05E0\u05E1\u05D9\u05D4",
          "\u05D4\u05E8\u05D0\u05DC \u05E4\u05E0\u05E1\u05D9\u05D4",
          "\u05DE\u05D2\u05D3\u05DC \u05E4\u05E0\u05E1\u05D9\u05D4",
          "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4",
          "\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA",
          "\u05E7\u05D5\u05E4\u05EA \u05D2\u05DE\u05DC"
        ]
      },
      {
        key: "transfers",
        label: "\u05D4\u05E2\u05D1\u05E8\u05D5\u05EA",
        icon: "swap_horiz",
        color: "#9ca3af",
        keywords: [
          "\u05D4\u05E2\u05D1\u05E8\u05D4",
          '\u05D4\u05E2\u05D1"\u05D1',
          "\u05D1\u05D9\u05EA \u05DC\u05D1\u05D9\u05EA",
          "\u05D1\u05D9\u05D8",
          "bit",
          "paybox",
          "\u05E4\u05E4\u05E8",
          "pepper",
          "\u05D4\u05E2\u05D1\u05E8\u05EA \u05D6\u05D4\u05D1",
          "\u05D4\u05E2\u05D1\u05E8\u05D4 \u05D1\u05D9\u05DF \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA",
          "\u05E9\u05E7",
          "\u05E6'\u05E7",
          "\u05E9\u05D9\u05E7",
          "\u05D4\u05DE\u05D7\u05D0\u05D4",
          "\u05E4\u05D9\u05E7\u05D3\u05D5\u05DF",
          '\u05E4\u05E7"\u05DE',
          "\u05E4\u05E7\u05D3\u05D5\u05DF",
          "\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF",
          "\u05D4\u05E4\u05E7\u05D3\u05D4 \u05DC\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF",
          // 2026-04-28: explicit children-savings keywords. These are
          // government deposits + parental match flowing to a kid's account
          // (₪57 + ₪57 = ₪114). Money leaves the parent's account but is NOT
          // an expense — it's a transfer to an asset.
          "\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF \u05DC\u05DB\u05DC \u05D9\u05DC\u05D3",
          "\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF \u05DC\u05D9\u05DC\u05D3",
          "\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF \u05DC\u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05DE\u05D2\u05D3\u05DC \u05D2\u05DE\u05DC \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05E4\u05E1\u05D2\u05D5\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8 \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05D9\u05DC\u05D9\u05DF \u05DC\u05E4\u05D9\u05D3\u05D5\u05EA \u05D9\u05DC\u05D3\u05D9\u05DD",
          "\u05DE\u05D9\u05D8\u05D1 \u05D2\u05DE\u05DC \u05D9\u05DC\u05D3\u05D9\u05DD"
        ],
        patterns: [/העברה?\s*(ל|מ|בין)/i, /שק\s*מס[\'\u0027]?\s*\d+/i, /צ['\u0027]?ק\s*\d+/i]
      },
      {
        key: "cash",
        label: "\u05DE\u05D6\u05D5\u05DE\u05DF",
        icon: "local_atm",
        color: "#78716c",
        keywords: ["\u05DE\u05E9\u05D9\u05DB\u05EA \u05DE\u05D6\u05D5\u05DE\u05DF", "\u05DB\u05E1\u05E4\u05D5\u05DE\u05D8", "atm", "\u05DE\u05E9\u05D9\u05DB\u05D4", "\u05DE\u05D6\u05D5\u05DE\u05DF", "cash", "cashback"],
        patterns: [/משיכת?\s*מזומן/i, /atm\s/i, /כספומט/i]
      },
      {
        key: "subscriptions",
        label: "\u05DE\u05E0\u05D5\u05D9\u05D9\u05DD",
        icon: "loyalty",
        color: "#2B694D",
        keywords: [
          "\u05DE\u05E0\u05D5\u05D9",
          "\u05D7\u05D5\u05D3\u05E9\u05D9",
          // ── SaaS & tech ──
          "google storage",
          "google one",
          "icloud",
          "dropbox",
          "zoom",
          "microsoft 365",
          "canva",
          "adobe",
          "chatgpt",
          "openai",
          "figma",
          "notion",
          "monday.com",
          "slack",
          "github"
        ]
      },
      {
        key: "refunds",
        label: "\u05D6\u05D9\u05DB\u05D5\u05D9\u05D9\u05DD \u05D1\u05D0\u05E9\u05E8\u05D0\u05D9",
        icon: "currency_exchange",
        color: "#059669",
        keywords: ["\u05D6\u05D9\u05DB\u05D5\u05D9", "\u05D4\u05D7\u05D6\u05E8", "refund", "credit", "\u05D1\u05D9\u05D8\u05D5\u05DC \u05E2\u05E1\u05E7\u05D4", "\u05D4\u05D7\u05D6\u05E8 \u05DB\u05E1\u05E4\u05D9", "\u05D6\u05D9\u05DB\u05D5\u05D9 \u05D0\u05E9\u05E8\u05D0\u05D9"],
        patterns: [/זיכוי\s*(מ|של|עבור|בגין)/i, /החזר\s*(כספי|תשלום|עסקה)/i]
      },
      {
        key: "fees",
        label: "\u05E2\u05DE\u05DC\u05D5\u05EA \u05D5\u05E8\u05D9\u05D1\u05D9\u05D5\u05EA",
        icon: "receipt_long",
        color: "#dc2626",
        keywords: [
          "\u05E2\u05DE\u05DC\u05D4",
          "\u05D3\u05DE\u05D9 \u05DB\u05E8\u05D8\u05D9\u05E1",
          "\u05E8\u05D9\u05D1\u05D9\u05EA",
          "\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC \u05D7\u05E9\u05D1\u05D5\u05DF",
          "\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC",
          "\u05E2\u05DE\u05DC\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4",
          "\u05D3\u05DE\u05D9 \u05E9\u05D9\u05DE\u05D5\u05E9",
          "\u05E2\u05DE\u05DC\u05EA \u05D4\u05DE\u05E8\u05D4",
          "\u05E2\u05DE\u05DC\u05EA \u05D4\u05E2\u05D1\u05E8\u05D4",
          "\u05D3\u05DE\u05D9 \u05D7\u05D9\u05D5\u05D1",
          "\u05E8\u05D9\u05D1\u05D9\u05EA \u05D7\u05D5\u05D1\u05D4",
          "\u05E8\u05D9\u05D1\u05D9\u05EA \u05E4\u05D9\u05D2\u05D5\u05E8\u05D9\u05DD",
          "\u05E2\u05DE\u05DC\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1",
          "\u05D3\u05DE\u05D9 \u05DB\u05E1\u05E4\u05D5\u05DE\u05D8",
          "\u05E2\u05DE\u05DC\u05EA \u05D1\u05E0\u05E7",
          '\u05E2\u05DE\u05DC\u05EA \u05DE\u05D8"\u05D7',
          '\u05E2\u05DE\u05DC\u05EA \u05E0\u05D9"\u05E2',
          "\u05E2\u05DE\u05DC\u05EA \u05E0\u05D9\u05D9\u05E8\u05D5\u05EA \u05E2\u05E8\u05DA",
          "\u05D3\u05DE\u05D9 \u05E0\u05D0\u05DE\u05E0\u05D5\u05EA",
          "\u05D3\u05DE\u05D9 \u05DE\u05E9\u05DE\u05E8\u05EA",
          "\u05E2\u05DE\u05DC\u05EA \u05D3\u05E3 \u05D7\u05E9\u05D1\u05D5\u05DF",
          "commission",
          "bank fee",
          "interest"
        ],
        patterns: [
          /עמל(ה|ת)\s/i,
          /דמי\s*(ניהול|כרטיס|שימוש|חיוב)/i,
          /ריבית\s*(חובה|פיגורים|שנתית|חודשית)?/i
        ]
      },
      {
        key: "dining_out",
        label: "\u05D0\u05D5\u05DB\u05DC \u05D1\u05D7\u05D5\u05E5 \u05D5\u05D1\u05D9\u05DC\u05D5\u05D9\u05D9\u05DD",
        icon: "restaurant",
        color: "#e11d48",
        keywords: [
          // ── Restaurants & cafés ──
          "\u05DE\u05E1\u05E2\u05D3\u05D4",
          "\u05E7\u05E4\u05D4",
          "\u05D1\u05D9\u05EA \u05E7\u05E4\u05D4",
          "\u05D0\u05E8\u05D5\u05DE\u05D4",
          "\u05E7\u05D5\u05E4\u05D9",
          "\u05E7\u05E4\u05D4 \u05D4\u05DC\u05DC",
          "\u05E7\u05E4\u05D4 \u05D0\u05D5\u05E8\u05D1\u05DF",
          "\u05D1\u05E8\u05E1\u05D8\u05D4",
          "\u05E7\u05E4\u05D4 \u05D2\u05E8\u05D2",
          "\u05E7\u05E4\u05D4 \u05DC\u05E0\u05D3\u05D5\u05D5\u05E8",
          "\u05E7\u05E4\u05D4 \u05E7\u05E4\u05D4",
          "coffee bean",
          // ── Fast food ──
          "\u05DE\u05E7\u05D3\u05D5\u05E0\u05DC\u05D3\u05E1",
          "mcdonald",
          "\u05D1\u05D5\u05E8\u05D2\u05E8 \u05E7\u05D9\u05E0\u05D2",
          "burger king",
          "\u05D3\u05D5\u05DE\u05D9\u05E0\u05D5\u05E1",
          "\u05E4\u05D9\u05E6\u05D4 \u05D4\u05D0\u05D8",
          "kfc",
          // ── Delivery ──
          "wolt",
          "\u05D5\u05D5\u05DC\u05D8",
          "japanika",
          "\u05D2'\u05E4\u05E0\u05D9\u05E7\u05D4",
          "ten bis",
          "\u05EA\u05DF \u05D1\u05D9\u05E1",
          "cibus",
          "\u05E1\u05D9\u05D1\u05D5\u05E1",
          "\u05DE\u05E9\u05DC\u05D5\u05D7\u05D4",
          // ── Asian / sushi ──
          "\u05E1\u05D5\u05E9\u05D9",
          "\u05E0\u05D2\u05D9\u05E1\u05D4",
          "\u05D0\u05D3\u05D5",
          "\u05E0\u05D5\u05D3\u05D4",
          // ── Israeli chains ──
          "\u05D0\u05D2\u05D3\u05D9\u05E8",
          "\u05E9\u05E4\u05D5\u05E0\u05D3\u05D9",
          "\u05D2\u05D5\u05D8\u05D4",
          "\u05D1\u05E0\u05D3\u05D9\u05E7\u05D8",
          "\u05DE\u05D5\u05E9\u05D1\u05D5\u05E6",
          "\u05D4\u05D1\u05E9\u05E8 \u05E9\u05DC \u05E2\u05E0\u05EA",
          "\u05DE\u05D7\u05E0\u05D9\u05D5\u05D3\u05D4",
          "\u05E0\u05DC\u05D4",
          "\u05D0\u05E0\u05E1\u05D8\u05E1\u05D9\u05D4",
          // ── Bars ──
          "\u05E4\u05D0\u05D1",
          "\u05D1\u05E8",
          "\u05DE\u05D9\u05D9\u05E7 \u05E4\u05DC\u05D9\u05D9\u05E1",
          "\u05DE\u05D5\u05DC\u05D9 \u05D1\u05DC\u05D5\u05DD",
          // ── Entertainment ──
          "\u05E1\u05D9\u05E0\u05DE\u05D4",
          "\u05E7\u05D5\u05DC\u05E0\u05D5\u05E2",
          "yes planet",
          "\u05E1\u05D9\u05E0\u05DE\u05D4 \u05E1\u05D9\u05D8\u05D9",
          "\u05D4\u05D5\u05E4\u05E2\u05D4",
          "\u05D4\u05E6\u05D2\u05D4",
          "\u05EA\u05D9\u05D0\u05D8\u05E8\u05D5\u05DF",
          "\u05D4\u05D1\u05D9\u05DE\u05D4",
          "\u05E7\u05D0\u05DE\u05E8\u05D9",
          "\u05DC\u05D1 \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1",
          "\u05E8\u05D0\u05E9\u05D5\u05DF \u05E1\u05E0\u05D8\u05E8",
          "\u05E7\u05E0\u05D9\u05D5\u05DF",
          // ── Ice cream / sweets ──
          "\u05D2\u05DC\u05D9\u05D3\u05D4",
          "\u05D2\u05D5\u05DC\u05D3\u05D4",
          "\u05D0\u05E0\u05E8\u05D9\u05E7\u05D5",
          "\u05D1\u05D9\u05E1\u05E7\u05D5\u05D8\u05D9"
        ],
        patterns: [/מסע(דה|דת)/i, /בית\s*קפה/i, /פיצ(ה|ריה)/i]
      },
      {
        key: "home_maintenance",
        label: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA \u05D1\u05D9\u05EA",
        icon: "handyman",
        color: "#0e7490",
        keywords: [
          // ── Hardware / DIY stores ──
          "\u05D4\u05D5\u05DD \u05E1\u05E0\u05D8\u05E8",
          "home center",
          "ace",
          "ace hardware",
          "\u05D4\u05D5\u05DD \u05D3\u05D9\u05E4\u05D5",
          "home depot",
          "\u05DE\u05D7\u05E1\u05E0\u05D9 \u05D7\u05E9\u05DE\u05DC",
          "\u05DE\u05D7\u05E1\u05E0\u05D9",
          "\u05D5\u05D5\u05DC\u05D4\u05E9\u05D5\u05E4",
          // ── Trades & repairs ──
          "\u05E9\u05E8\u05D1\u05E8\u05D1",
          "\u05D0\u05D9\u05E0\u05E1\u05D8\u05DC\u05D8\u05D5\u05E8",
          "\u05D7\u05E9\u05DE\u05DC\u05D0\u05D9",
          "\u05D8\u05DB\u05E0\u05D0\u05D9",
          "\u05D8\u05DB\u05E0\u05D0\u05D9 \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
          "\u05D8\u05DB\u05E0\u05D0\u05D9 \u05DB\u05D1\u05D9\u05E1\u05D4",
          "\u05D8\u05DB\u05E0\u05D0\u05D9 \u05DE\u05E7\u05E8\u05E8",
          "\u05D8\u05DB\u05E0\u05D0\u05D9 \u05EA\u05E0\u05D5\u05E8",
          "\u05EA\u05D9\u05E7\u05D5\u05DF",
          "\u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD",
          "\u05E9\u05D9\u05E4\u05D5\u05E5",
          "\u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD",
          "\u05E7\u05D1\u05DC\u05DF \u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD",
          "\u05D4\u05D3\u05D1\u05E8\u05D4",
          "\u05E0\u05D9\u05E7\u05D9\u05D5\u05DF",
          "\u05E0\u05D9\u05E7\u05D5\u05D9",
          "\u05E0\u05D9\u05E7\u05D5\u05D9 \u05E1\u05E4\u05D5\u05EA",
          "\u05E0\u05D9\u05E7\u05D5\u05D9 \u05E9\u05D8\u05D9\u05D7\u05D9\u05DD",
          "\u05E4\u05D5\u05DC\u05D9\u05E9",
          "\u05E4\u05D5\u05DC\u05D9\u05E9 \u05E8\u05E6\u05E4\u05D5\u05EA",
          // ── Home goods & materials ──
          "\u05E6\u05D1\u05E2",
          "\u05E6\u05D1\u05E2\u05D9",
          "\u05E6\u05D1\u05D9\u05E2\u05D4",
          "\u05D8\u05DE\u05D1\u05D5\u05E8",
          "\u05E0\u05D9\u05E8\u05DC\u05D8",
          "\u05D0\u05E8\u05D9\u05D7\u05D9\u05DD",
          "\u05E7\u05E8\u05DE\u05D9\u05E7\u05D4",
          "\u05E4\u05D5\u05E8\u05DE\u05D9\u05D9\u05E7\u05D4",
          "\u05E4\u05E8\u05E7\u05D8",
          "\u05D0\u05D1\u05DF \u05E7\u05D9\u05E1\u05E8",
          "\u05DE\u05D8\u05D1\u05D7\u05D9\u05DD",
          "\u05D2\u05E8\u05E0\u05D9\u05D8",
          // ── Appliance service & parts ──
          "\u05D0\u05DC\u05E7\u05D8\u05E8\u05D4",
          "\u05D8\u05D5\u05E8\u05E0\u05D3\u05D5",
          "\u05E1\u05D4\u05E8",
          "\u05D3\u05D5\u05D3 \u05E9\u05DE\u05E9",
          "\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4",
          "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA",
          "\u05D0\u05D7\u05D6\u05E7\u05D4",
          // ── Gardening ──
          "\u05D2\u05D9\u05E0\u05D5\u05DF",
          "\u05D2\u05E0\u05DF",
          "\u05D3\u05E9\u05D0",
          "\u05DE\u05E9\u05EA\u05DC\u05D4",
          "\u05DE\u05E9\u05EA\u05DC\u05EA"
        ],
        patterns: [
          /שרברב|אינסטלטור|חשמלאי/i,
          /תיקון\s*(מזגן|מקרר|תנור|כביסה|מייבש|דוד)/i,
          /טכנאי\s*\S+/i,
          /שיפוצ(ים|ים)?/i
        ]
      },
      {
        // Explicit user-selectable "miscellaneous" — distinct from "other" (which
        // is the auto-fallback for unrecognized merchants). Items tagged "misc"
        // have been manually acknowledged by the user as "known but non-specific".
        // No auto-keywords: the categorizer never auto-assigns this — only the user.
        key: "misc",
        label: "\u05E9\u05D5\u05E0\u05D5\u05EA",
        icon: "category",
        color: "#9ca3af",
        keywords: []
      },
      /* ──────── Self-employed / business categories ────────
       * These auto-classify regardless of the personal/business scope toggle —
       * the toggle is orthogonal. Nir's typical client is an עצמאי: the goal
       * is to surface a clean separation between עסק and חיים פרטיים. */
      {
        key: "advertising_marketing",
        label: "\u05E4\u05E8\u05E1\u05D5\u05DD \u05D5\u05E9\u05D9\u05D5\u05D5\u05E7",
        icon: "campaign",
        color: "#7C3AED",
        keywords: [
          // Ad platforms
          "google ads",
          "google adwords",
          "adwords",
          "facebook ads",
          "facebook business",
          "meta ads",
          "instagram ads",
          "linkedin ads",
          "twitter ads",
          "x ads",
          "tiktok ads",
          "youtube ads",
          "taboola",
          "outbrain",
          "snap ads",
          "pinterest ads",
          "reddit ads",
          // Email / marketing automation
          "mailchimp",
          "sendgrid",
          "klaviyo",
          "active campaign",
          "constant contact",
          "hubspot",
          "salesforce",
          "marketo",
          // SEO / analytics
          "semrush",
          "ahrefs",
          "moz",
          "google analytics",
          "hotjar",
          "mixpanel",
          // Design / creative
          "canva pro",
          "adobe creative",
          "adobe stock",
          "shutterstock",
          "envato",
          // Hebrew
          "\u05E4\u05E8\u05E1\u05D5\u05DD",
          "\u05E9\u05D9\u05D5\u05D5\u05E7",
          "\u05DE\u05D5\u05D3\u05E2\u05D4",
          "\u05DE\u05D5\u05D3\u05E2\u05D5\u05EA",
          "\u05E7\u05DE\u05E4\u05D9\u05D9\u05DF",
          "\u05DE\u05DE\u05D5\u05DE\u05DF",
          "\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05E2\u05E1\u05E7\u05D9",
          "\u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD \u05E2\u05E1\u05E7\u05D9",
          "\u05E4\u05E8\u05D9\u05DC\u05E0\u05E1\u05E8 \u05E2\u05D9\u05E6\u05D5\u05D1"
        ]
      },
      {
        key: "professional_services",
        label: "\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9\u05D9\u05DD",
        icon: "work",
        color: "#0E7490",
        keywords: [
          // Hebrew
          "\u05E8\u05D5\u05D0\u05D4 \u05D7\u05E9\u05D1\u05D5\u05DF",
          '\u05E8\u05D5"\u05D7',
          "\u05E8\u05D5\u05D0\u05D9 \u05D7\u05E9\u05D1\u05D5\u05DF",
          "\u05DE\u05E0\u05D4\u05DC \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA",
          "\u05DE\u05E0\u05D4\u05DC\u05EA \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA",
          "\u05D9\u05D9\u05E2\u05D5\u05E5 \u05DE\u05E1",
          "\u05D9\u05D5\u05E2\u05E5 \u05DE\u05E1",
          "\u05E2\u05D5\u05E8\u05DA \u05D3\u05D9\u05DF",
          '\u05E2\u05D5"\u05D3',
          "\u05E2\u05D5\u05E8\u05DB\u05EA \u05D3\u05D9\u05DF",
          "\u05E0\u05D5\u05D8\u05E8\u05D9\u05D5\u05DF",
          "\u05D9\u05D5\u05E2\u05E5 \u05E2\u05E1\u05E7\u05D9",
          "\u05D9\u05D9\u05E2\u05D5\u05E5 \u05E2\u05E1\u05E7\u05D9",
          "\u05DE\u05E0\u05D8\u05D5\u05E8",
          "\u05E7\u05D5\u05D0\u05D5\u05E6",
          "\u05E7\u05D5\u05D0\u05D5\u05E6\u05F3\u05D9\u05E0\u05D2",
          "\u05D0\u05D3\u05E8\u05D9\u05DB\u05DC",
          "\u05DE\u05E2\u05E6\u05D1 \u05E4\u05E0\u05D9\u05DD",
          "\u05E6\u05D9\u05DC\u05D5\u05DD \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9",
          "\u05EA\u05E8\u05D2\u05D5\u05DD \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9",
          "\u05EA\u05E8\u05D2\u05D5\u05DD",
          "\u05DB\u05EA\u05D9\u05D1\u05D4 \u05E9\u05D9\u05D5\u05D5\u05E7\u05D9\u05EA",
          "\u05D9\u05D9\u05E2\u05D5\u05E5 \u05DE\u05E9\u05E4\u05D8\u05D9",
          // English freelance platforms
          "fiverr",
          "upwork",
          "freelancer.com",
          "toptal",
          "99designs",
          // Hebrew freelance
          "\u05E4\u05E8\u05D9\u05DC\u05E0\u05E1\u05E8",
          "\u05E4\u05E8\u05D9\u05DC\u05E0\u05E1\u05E8\u05D9\u05DD"
        ]
      },
      {
        key: "business_taxes",
        label: '\u05DE\u05E2"\u05DE \u05D5\u05DE\u05D9\u05E1\u05D9\u05DD \u05E2\u05E1\u05E7\u05D9\u05D9\u05DD',
        icon: "receipt",
        color: "#B45309",
        keywords: [
          '\u05DE\u05E2"\u05DE',
          "\u05DE\u05E2\u05F4\u05DE",
          "\u05DE\u05E2 \u05DE",
          "\u05DE\u05E7\u05D3\u05DE\u05EA \u05DE\u05E1",
          "\u05DE\u05E7\u05D3\u05DE\u05D5\u05EA \u05DE\u05E1",
          "\u05E0\u05D9\u05DB\u05D5\u05D9 \u05DE\u05E1 \u05D1\u05DE\u05E7\u05D5\u05E8",
          "\u05E0\u05D9\u05DB\u05D5\u05D9 \u05D1\u05DE\u05E7\u05D5\u05E8",
          "\u05DE\u05E1 \u05D4\u05DB\u05E0\u05E1\u05D4",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 \u05E2\u05E6\u05DE\u05D0\u05D9",
          "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9 - \u05E2\u05E6\u05DE\u05D0\u05D9",
          "\u05E8\u05E9\u05D5\u05EA \u05D4\u05DE\u05E1\u05D9\u05DD",
          "\u05DE\u05E1 \u05E2\u05E8\u05DA \u05DE\u05D5\u05E1\u05E3",
          "\u05D4\u05D7\u05D6\u05E8 \u05DE\u05E2"
        ],
        patterns: [/מע["״]?מ/i, /מקדמ(ה|ות)\s*מס/i]
      },
      {
        key: "business_payments",
        label: "\u05E1\u05DC\u05D9\u05E7\u05D4 \u05D5\u05E2\u05DE\u05DC\u05D5\u05EA \u05E2\u05E1\u05E7\u05D9\u05D5\u05EA",
        icon: "point_of_sale",
        color: "#6B21A8",
        keywords: [
          "cardcom",
          "\u05E7\u05D0\u05E8\u05D3\u05E7\u05D5\u05DD",
          "tranzila",
          "\u05D8\u05E8\u05E0\u05D6\u05D9\u05DC\u05D4",
          "pelecard",
          "\u05E4\u05DC\u05D0 \u05E7\u05D0\u05E8\u05D3",
          "\u05E4\u05DC\u05D0\u05E7\u05D0\u05E8\u05D3",
          "isracard merchant",
          "stripe",
          "paypal",
          "paypal pro",
          "square",
          "sumup",
          "iziplay",
          "izipay",
          "bit \u05E2\u05E1\u05E7\u05D9",
          "\u05D1\u05D9\u05D8 \u05E2\u05E1\u05E7\u05D9",
          "\u05E1\u05DC\u05D9\u05E7\u05D4",
          "\u05E2\u05DE\u05DC\u05EA \u05E1\u05DC\u05D9\u05E7\u05D4",
          "\u05E2\u05DE\u05DC\u05EA \u05EA\u05E9\u05DC\u05D5\u05DD"
        ]
      }
    ];
    OVERRIDES_KEY = "verdant:category_overrides";
    BIT_PATTERN_PREFIX = "__bit__:";
  }
});

// src/shims/server-only.ts
var init_server_only = __esm({
  "src/shims/server-only.ts"() {
    "use strict";
  }
});

// ../lib/anthropic-client.ts
import Anthropic from "@anthropic-ai/sdk";
function getAnthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY || process.env.PLANAPI;
  return k && k.trim() ? k.trim() : null;
}
function createAnthropicClient() {
  const apiKey2 = getAnthropicKey();
  if (!apiKey2) return null;
  return new Anthropic({ apiKey: apiKey2, timeout: 6e4, maxRetries: 2 });
}
var init_anthropic_client = __esm({
  "../lib/anthropic-client.ts"() {
    "use strict";
    init_server_only();
  }
});

// ../lib/doc-parser/vision-pdf-parser.ts
var vision_pdf_parser_exports = {};
__export(vision_pdf_parser_exports, {
  parsePDFWithVision: () => parsePDFWithVision
});
import Anthropic2 from "@anthropic-ai/sdk";
async function parsePDFWithVision(buffer, filename) {
  if (!getAnthropicKey()) {
    return errorDoc(filename, "\u05D6\u05D9\u05D4\u05D5\u05D9 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u2014 \u05DE\u05E4\u05EA\u05D7 Anthropic \u05D7\u05E1\u05E8 \u05D1\u05E1\u05D1\u05D9\u05D1\u05EA \u05D4\u05E9\u05E8\u05EA");
  }
  const client2 = createAnthropicClient();
  if (!client2) {
    return errorDoc(filename, "\u05D6\u05D9\u05D4\u05D5\u05D9 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u2014 \u05DE\u05E4\u05EA\u05D7 Anthropic \u05D7\u05E1\u05E8 \u05D1\u05E1\u05D1\u05D9\u05D1\u05EA \u05D4\u05E9\u05E8\u05EA");
  }
  const pdfBase64 = buffer.toString("base64");
  try {
    const response = await client2.messages.parse({
      model: MODEL,
      max_tokens: 16e3,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // System prompt is fixed across every Vision call — cache it.
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64
              }
            },
            {
              type: "text",
              text: `Extract every transaction from this file: ${filename}`
            }
          ]
        }
      ],
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA }
      }
    });
    const parsed = response.parsed_output;
    if (!parsed || !Array.isArray(parsed.transactions)) {
      return errorDoc(
        filename,
        "Claude \u05D6\u05D9\u05D4\u05D4 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 \u05D0\u05D1\u05DC \u05D4\u05E4\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05D0\u05DD \u05D0\u05EA \u05D4\u05E1\u05DB\u05DE\u05D4 \u05D4\u05E6\u05E4\u05D5\u05D9\u05D4 \u2014 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D0\u05D5 \u05D4\u05E2\u05DC\u05D4 \u05E7\u05D5\u05D1\u05E5 Excel"
      );
    }
    const transactions = parsed.transactions.map((t) => {
      const cat = categorize(t.description);
      return {
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: cat.key,
        categoryLabel: cat.label,
        confidence: cat.confidence,
        raw: `[vision] ${t.description}`
      };
    });
    const totalDebit = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalCredit = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = transactions.map((t) => t.date).filter(Boolean).sort();
    const warnings = [
      `\u{1F4F7} \u05E7\u05D5\u05D1\u05E5 \u05D6\u05D4 \u05E0\u05E1\u05E8\u05E7 \u05D1\u05D0\u05DE\u05E6\u05E2\u05D5\u05EA \u05D6\u05D9\u05D4\u05D5\u05D9 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9 (${MODEL}). \u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05D4\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05DC\u05E4\u05E0\u05D9 \u05E9\u05DE\u05D9\u05E8\u05D4.`,
      ...parsed.warnings ?? []
    ];
    return {
      filename,
      type: "pdf",
      bankHint: parsed.bankHint || "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4",
      transactions,
      totalDebit,
      totalCredit,
      dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
      warnings,
      openingBalance: parsed.openingBalance ?? void 0,
      closingBalance: parsed.closingBalance ?? void 0
    };
  } catch (err) {
    if (err instanceof Anthropic2.RateLimitError) {
      return errorDoc(filename, "\u05D4\u05E9\u05E8\u05EA \u05EA\u05E4\u05D5\u05E1 \u05DB\u05E8\u05D2\u05E2 \u2014 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4");
    }
    if (err instanceof Anthropic2.AuthenticationError) {
      return errorDoc(filename, "\u05D1\u05E2\u05D9\u05D9\u05EA \u05D4\u05E8\u05E9\u05D0\u05D5\u05EA API \u2014 \u05E4\u05E0\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA");
    }
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[vision-pdf-parser] failed:", reason);
    return errorDoc(filename, `\u05DB\u05E9\u05DC \u05D1\u05D6\u05D9\u05D4\u05D5\u05D9 \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9: ${reason.slice(0, 100)}`);
  }
}
function errorDoc(filename, warning) {
  return {
    filename,
    type: "pdf",
    bankHint: "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4",
    transactions: [],
    totalDebit: 0,
    totalCredit: 0,
    dateRange: { from: "", to: "" },
    warnings: [warning]
  };
}
var MODEL, EXTRACTION_SCHEMA, SYSTEM_PROMPT;
var init_vision_pdf_parser = __esm({
  "../lib/doc-parser/vision-pdf-parser.ts"() {
    "use strict";
    init_anthropic_client();
    init_categorizer();
    MODEL = "claude-opus-4-7";
    EXTRACTION_SCHEMA = {
      type: "object",
      properties: {
        bankHint: {
          type: "string",
          description: 'Bank or credit card issuer in Hebrew (e.g. "\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD", "\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8"). Use "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" if unclear.'
        },
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Transaction date in ISO format YYYY-MM-DD"
              },
              description: {
                type: "string",
                description: "Original Hebrew merchant name or operation"
              },
              amount: {
                type: "number",
                description: "Positive for expenses (\u05D7\u05D5\u05D1\u05D4), negative for income (\u05D6\u05DB\u05D5\u05EA). Two decimal places."
              }
            },
            required: ["date", "description", "amount"],
            additionalProperties: false
          }
        },
        openingBalance: { type: ["number", "null"] },
        closingBalance: { type: ["number", "null"] },
        warnings: { type: "array", items: { type: "string" } }
      },
      required: ["bankHint", "transactions"],
      additionalProperties: false
    };
    SYSTEM_PROMPT = `You are extracting transactions from a scanned Israeli bank statement or credit card PDF.

The PDF is likely a scanned image (the prior text-based parser returned zero
results). Read it visually and extract every transaction line.

Per transaction:
- date: ISO 8601 (YYYY-MM-DD). Convert DD/MM/YYYY or DD-MM-YYYY \u2192 YYYY-MM-DD.
  If only month/year visible, use the 1st of that month.
- description: Merchant name or operation in original Hebrew. Preserve the
  original text \u2014 do NOT translate, normalize, or expand abbreviations.
  Strip generic prefixes like "\u05D4\u05D5\u05E8\u05D0\u05EA \u05E7\u05D1\u05E2", "\u05D7\u05D9\u05D5\u05D1 \u05D0\u05E9\u05E8\u05D0\u05D9", "\u05EA\u05E9\u05DC\u05D5\u05DD \u05DC-" but keep
  the actual merchant name.
- amount: Positive number (\u20AA) for expenses (\u05D7\u05D5\u05D1\u05D4 / debit / charge), negative
  for income (\u05D6\u05DB\u05D5\u05EA / credit / refund). For credit-card statements the column
  is usually a single "\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1" \u2014 positive expense, negative refund.

Identify the bank or credit card issuer by visible logo/header/branding:
- Banks: \u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD, \u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9, \u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8, \u05DE\u05D6\u05E8\u05D7\u05D9-\u05D8\u05E4\u05D7\u05D5\u05EA, \u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9,
  \u05DE\u05E8\u05DB\u05E0\u05EA\u05D9\u05DC, \u05D9\u05D4\u05D1, \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD, \u05D5\u05D5\u05D0\u05DF \u05D6\u05D9\u05E8\u05D5
- Credit cards: \u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8, \u05DB\u05D0\u05DC, \u05DE\u05E7\u05E1, \u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC, \u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1, \u05D3\u05D9\u05D9\u05E0\u05E8\u05E1
- If you cannot identify, return "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" \u2014 do not guess.

Also extract opening (\u05D9\u05EA\u05E8\u05EA \u05E4\u05EA\u05D9\u05D7\u05D4) and closing (\u05D9\u05EA\u05E8\u05EA \u05E1\u05D2\u05D9\u05E8\u05D4) balances when
visible \u2014 they let the system run a reconciliation sum check downstream.

Precision matters: if the table shows N rows, return N transactions. Missing
transactions cause the reconciliation check to fail. If a row is unreadable,
include a warning describing the issue rather than skipping it silently.

If the document is unreadable, encrypted, or empty, return an empty
transactions array with a warning that explains why.`;
  }
});

// src/server.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// src/env.ts
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
var __dirname = dirname(fileURLToPath(import.meta.url));
config();
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../../.env.local"), override: false });
var env = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  PORT: Number(process.env.PORT || 3001),
  // Comma-separated list of allowed CORS origins (the Vite dev + prod URLs).
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
  // Where OAuth flows (Google Calendar) redirect the browser back to — the
  // SPA origin, not the backend. Falls back to the first CORS origin.
  FRONTEND_URL: process.env.FRONTEND_URL || (process.env.CORS_ORIGINS || "http://localhost:5173").split(",")[0],
  NODE_ENV: process.env.NODE_ENV || "development"
};
function crossSiteCookie(maxAgeMs, httpOnly = true) {
  const prod = (process.env.NODE_ENV || "development") === "production";
  return {
    httpOnly,
    secure: prod,
    sameSite: prod ? "none" : "lax",
    path: "/",
    maxAge: maxAgeMs
  };
}
function assertSupabaseEnv() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase env missing: set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents)."
    );
  }
}

// src/routes/health.ts
import { Router } from "express";
var healthRouter = Router();
healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "plan-backend",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});

// src/routes/crm.ts
import { Router as Router2 } from "express";
import { z } from "zod";

// src/supabase.ts
var import_supabase_js = __toESM(require_dist(), 1);
function createUserClient(accessToken) {
  return (0, import_supabase_js.createClient)(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var _admin = null;
function createAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing \u2014 admin client unavailable");
  }
  if (!_admin) {
    _admin = (0, import_supabase_js.createClient)(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _admin;
}

// src/middleware/auth.ts
function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}
async function requireUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const sb = createUserClient(token);
  const {
    data: { user },
    error
  } = await sb.auth.getUser();
  if (error || !user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.user = user;
  req.sb = sb;
  req.accessToken = token;
  next();
}
async function requireAdvisor(req, res, next) {
  if (!req.user || !req.sb) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const { data: advisor } = await req.sb.from("advisors").select("id").eq("id", req.user.id).maybeSingle();
  if (!advisor) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

// src/lib/async-handler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// src/lib/validate.ts
function validate(body, schema, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ ok: false, error: "validation_failed", issues: result.error.issues });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}

// src/routes/crm.ts
var crmRouter = Router2();
crmRouter.use(requireUser, requireAdvisor);
crmRouter.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const user = req.user;
    const { data: households, error } = await sb.from("households").select(
      "id, family_name, members_count, stage, created_at, signup_source, client_users(count)"
    ).eq("advisor_id", user.id).order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = households || [];
    const visible = rows.filter((h) => {
      const linked = h.client_users?.[0]?.count ?? 0;
      if (h.signup_source === "self_signup" && linked === 0) return false;
      return true;
    });
    const householdIds = visible.map((h) => h.id);
    const [netWorthRes, docHistoryRes] = await Promise.all([
      sb.from("v_net_worth").select("household_id, net_worth").in("household_id", householdIds),
      sb.from("client_state").select("household_id, state_value").eq("state_key", "doc_history").in("household_id", householdIds)
    ]);
    const netWorthMap = Object.fromEntries(
      (netWorthRes.data ?? []).map((r) => [r.household_id, r.net_worth])
    );
    const docDataMap = Object.fromEntries(
      (docHistoryRes.data ?? []).map((r) => {
        const arr = Array.isArray(r.state_value) ? r.state_value : [];
        return [r.household_id, arr];
      })
    );
    const cleaned = visible.map(({ client_users, ...rest }) => {
      void client_users;
      const docs = docDataMap[rest.id] ?? [];
      return {
        ...rest,
        net_worth: netWorthMap[rest.id] ?? null,
        docs_uploaded: docs.length,
        docs_list: docs.map((d) => ({
          filename: d.filename,
          uploadedAt: d.uploadedAt,
          bankHint: d.bankHint ?? null
        }))
      };
    });
    res.json({ households: cleaned });
  })
);
var CreateHouseholdSchema = z.object({
  familyName: z.string().trim().min(1).max(200),
  membersCount: z.number().int().positive().max(20).optional()
});
crmRouter.post(
  "/households",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, CreateHouseholdSchema, res);
    if (!parsed.ok) return;
    const { data: created, error } = await req.sb.from("households").insert({
      advisor_id: req.user.id,
      family_name: parsed.data.familyName.trim(),
      members_count: parsed.data.membersCount ?? 1,
      stage: "onboarding",
      signup_source: "lead_conversion"
    }).select("id, family_name, members_count, stage, created_at").single();
    if (error || !created) {
      res.status(500).json({ error: "household_create_failed", detail: error?.message ?? "unknown" });
      return;
    }
    res.json({ ok: true, household: created });
  })
);
var ALLOWED_STAGES = /* @__PURE__ */ new Set(["onboarding", "active", "review", "archived"]);
crmRouter.post(
  "/clients/:id/stage",
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    const stage = String(req.body?.stage || "");
    if (!ALLOWED_STAGES.has(stage)) {
      res.status(400).json({ error: "invalid stage" });
      return;
    }
    const { error } = await req.sb.from("households").update({ stage }).eq("id", householdId);
    if (error) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json({ ok: true, stage });
  })
);

// src/routes/settings.ts
import { Router as Router3 } from "express";
import { z as z2 } from "zod";

// ../lib/doc-parser/issuer-registry.ts
var ISSUERS = [
  {
    id: "isracard",
    label: "\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8",
    kind: "credit",
    hasParser: false,
    aliases: ["isracard", "\u05D9\u05E9\u05E8\u05D0 \u05DB\u05E8\u05D8"]
  },
  {
    id: "cal",
    label: "\u05DB\u05D0\u05DC",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/cal-pdf-parser.ts",
    parserVariants: [
      {
        id: "cal:digital-detail",
        label: "\u05D3\u05E3 \u05E4\u05D9\u05E8\u05D5\u05D8 \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC\u05D9",
        parserFile: "lib/doc-parser/cal-pdf-parser.ts",
        description: "\u05E4\u05D5\u05E8\u05DE\u05D8 CAL/Diners \u05E9\u05D1\u05D5 \u05D4\u05E9\u05D5\u05E8\u05D5\u05EA \u05E0\u05E9\u05DC\u05E4\u05D5\u05EA \u05D4\u05E4\u05D5\u05DB\u05D5\u05EA RTL \u05E2\u05DD \u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05E4\u05D5\u05DA \u05D1\u05E1\u05D5\u05E3 \u05D4\u05E9\u05D5\u05E8\u05D4."
      }
    ],
    aliases: ["\u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC", "visa cal", "\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 \u05D0\u05E9\u05E8\u05D0\u05D9 \u05DC\u05D9\u05E9\u05E8\u05D0\u05DC", "\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1"]
  },
  {
    id: "max",
    label: "\u05DE\u05E7\u05E1",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/max-pdf-parser.ts",
    parserVariants: [
      {
        id: "max:monthly-statement",
        label: "\u05D3\u05E3 \u05D7\u05D9\u05D5\u05D1\u05D9\u05DD \u05D7\u05D5\u05D3\u05E9\u05D9",
        parserFile: "lib/doc-parser/max-pdf-parser.ts",
        description: "\u05E4\u05D5\u05E8\u05DE\u05D8 MAX \u05E2\u05DD \u05D8\u05D1\u05DC\u05D0\u05D5\u05EA \u05E2\u05E1\u05E7\u05D5\u05EA \u05D1\u05D0\u05E8\u05E5 \u05D5\u05E2\u05E1\u05E7\u05D5\u05EA \u05D7\u05D5\u05F4\u05DC, \u05DB\u05D5\u05DC\u05DC BIT/PAYBOX."
      }
    ],
    aliases: ["max", "\u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3", "leumi card"]
  },
  {
    id: "american-express",
    label: "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/amex-pdf-parser.ts",
    parserVariants: [
      {
        id: "american-express:monthly-local",
        label: "\u05D3\u05E3 \u05D7\u05D9\u05D5\u05D1\u05D9\u05DD \u05D7\u05D5\u05D3\u05E9\u05D9 - \u05E2\u05E1\u05E7\u05D5\u05EA \u05D1\u05D0\u05E8\u05E5",
        parserFile: "lib/doc-parser/amex-pdf-parser.ts",
        description: "\u05E4\u05D5\u05E8\u05DE\u05D8 \u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1 \u05E2\u05DD \u05E2\u05DE\u05D5\u05D3\u05D5\u05EA: \u05D4\u05D5\u05E6\u05D2/\u05DC\u05D0 \u05D4\u05D5\u05E6\u05D2, \u05E2\u05E0\u05E3, \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7 \u05D5\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1."
      }
    ],
    aliases: ["\u05D0\u05DE\u05E7\u05E1", "amex", "american express"]
  },
  {
    id: "diners",
    label: "\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1",
    kind: "credit",
    hasParser: true,
    parserFile: "lib/doc-parser/cal-pdf-parser.ts",
    parserVariants: [
      {
        id: "diners:digital-detail",
        label: "\u05D3\u05E3 \u05E4\u05D9\u05E8\u05D5\u05D8 \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC\u05D9",
        parserFile: "lib/doc-parser/cal-pdf-parser.ts",
        description: "\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1 \u05DE\u05D6\u05D5\u05D4\u05D4 \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 CAL \u05D4\u05E7\u05D9\u05D9\u05DD."
      }
    ],
    aliases: ["diners"]
  },
  {
    id: "leumi-visa",
    label: "\u05D5\u05D9\u05D6\u05D4 \u05DC\u05D0\u05D5\u05DE\u05D9",
    kind: "credit",
    hasParser: false,
    aliases: ["\u05DC\u05D0\u05D5\u05DE\u05D9 \u05D5\u05D9\u05D6\u05D4", "\u05D5\u05D9\u05D6\u05D4 \u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9"]
  },
  {
    id: "hapoalim",
    label: "\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD",
    kind: "bank",
    hasParser: false,
    aliases: ["poalim", "bank hapoalim", "\u05D1\u05E0\u05E7 12"]
  },
  {
    id: "leumi",
    label: "\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9",
    kind: "bank",
    hasParser: false,
    aliases: ["leumi", "bank leumi", "\u05D1\u05E0\u05E7 10"]
  },
  {
    id: "discount",
    label: "\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8",
    kind: "bank",
    hasParser: false,
    aliases: ["discount", "bank discount", "\u05D1\u05E0\u05E7 11"]
  },
  {
    id: "mizrahi-tefahot",
    label: "\u05D1\u05E0\u05E7 \u05DE\u05D6\u05E8\u05D7\u05D9-\u05D8\u05E4\u05D7\u05D5\u05EA",
    kind: "bank",
    hasParser: false,
    aliases: ["mizrahi", "tefahot", "\u05D1\u05E0\u05E7 20"]
  },
  {
    id: "fibi",
    label: "\u05D1\u05E0\u05E7 \u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9",
    kind: "bank",
    hasParser: false,
    aliases: ["fibi", "international", "\u05D1\u05E0\u05E7 31"]
  },
  {
    id: "mercantile",
    label: "\u05D1\u05E0\u05E7 \u05DE\u05E8\u05DB\u05E0\u05EA\u05D9\u05DC",
    kind: "bank",
    hasParser: false,
    aliases: ["mercantile", "\u05D1\u05E0\u05E7 17"]
  },
  {
    id: "massad",
    label: "\u05D1\u05E0\u05E7 \u05DE\u05E1\u05D3",
    kind: "bank",
    hasParser: false,
    aliases: ["massad", "\u05D1\u05E0\u05E7 46"]
  },
  {
    id: "yahav",
    label: "\u05D1\u05E0\u05E7 \u05D9\u05D4\u05D1",
    kind: "bank",
    hasParser: false,
    aliases: ["yahav", "\u05D1\u05E0\u05E7 04"]
  },
  {
    id: "jerusalem",
    label: "\u05D1\u05E0\u05E7 \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD",
    kind: "bank",
    hasParser: false,
    aliases: ["jerusalem", "\u05D1\u05E0\u05E7 54"]
  },
  {
    id: "otsar-hahayal",
    label: "\u05D1\u05E0\u05E7 \u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC",
    kind: "bank",
    hasParser: false,
    aliases: ["\u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC", "otsar hahayal", "\u05D1\u05E0\u05E7 14"]
  },
  {
    id: "one-zero",
    label: "\u05D5\u05D5\u05D0\u05DF \u05D6\u05D9\u05E8\u05D5",
    kind: "bank",
    hasParser: false,
    aliases: ["one zero", "1zero"]
  },
  {
    id: "bank-esh",
    label: "\u05D1\u05E0\u05E7 \u05D0\u05E9 \u05D9\u05E9\u05E8\u05D0\u05DC",
    kind: "bank",
    hasParser: false,
    aliases: ["\u05D0\u05E9 \u05D9\u05E9\u05E8\u05D0\u05DC", "esh bank", "\u05D1\u05E0\u05E7 03"]
  },
  {
    id: "postal-bank",
    label: "\u05D1\u05E0\u05E7 \u05D4\u05D3\u05D5\u05D0\u05E8",
    kind: "bank",
    hasParser: false,
    aliases: ["\u05D3\u05D5\u05D0\u05E8 \u05D9\u05E9\u05E8\u05D0\u05DC", "postal bank", "\u05D1\u05E0\u05E7 09"]
  }
];
var ISSUER_IDS = new Set(ISSUERS.map((issuer) => issuer.id));
var ISSUER_STATUS_IDS = /* @__PURE__ */ new Set([
  ...ISSUERS.map((issuer) => issuer.id),
  ...ISSUERS.flatMap((issuer) => issuer.parserVariants?.map((variant) => variant.id) ?? [])
]);

// src/routes/settings.ts
var settingsRouter = Router3();
settingsRouter.use(requireUser);
var PrefsSchema = z2.object({
  preferences: z2.object({
    ai_categorizer: z2.enum(["haiku", "perplexity"]).optional()
  })
});
settingsRouter.get("/preferences", (req, res) => {
  const aiModel = req.cookies?.ai_categorizer_model || "haiku";
  res.json({ preferences: { ai_categorizer: aiModel } });
});
settingsRouter.patch("/preferences", (req, res) => {
  const parsed = validate(req.body, PrefsSchema, res);
  if (!parsed.ok) return;
  const model = parsed.data.preferences.ai_categorizer;
  if (model) {
    res.cookie("ai_categorizer_model", model, {
      path: "/",
      maxAge: 1e3 * 60 * 60 * 24 * 365,
      httpOnly: false,
      sameSite: "lax"
    });
  }
  res.json({ success: true, preferences: parsed.data.preferences });
});
var PatchIssuerStatusSchema = z2.object({
  issuerId: z2.string().min(1),
  verified: z2.boolean(),
  notes: z2.string().max(1e3).nullable().optional()
});
settingsRouter.get(
  "/issuer-status",
  asyncHandler(async (req, res) => {
    const { data, error } = await req.sb.from("issuer_mapping_status").select("issuer_id, verified, notes, updated_at, updated_by").order("issuer_id");
    if (error) {
      console.error("[issuer-status] read failed:", error);
      res.status(500).json({ ok: false, error: "read_failed" });
      return;
    }
    res.json({ ok: true, statuses: data ?? [] });
  })
);
settingsRouter.patch(
  "/issuer-status",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, PatchIssuerStatusSchema, res);
    if (!parsed.ok) return;
    const issuerId = parsed.data.issuerId.trim();
    if (!ISSUER_STATUS_IDS.has(issuerId)) {
      res.status(400).json({ ok: false, error: "unknown_issuer" });
      return;
    }
    const notes = parsed.data.notes?.trim() || null;
    const { data, error } = await req.sb.from("issuer_mapping_status").upsert(
      {
        issuer_id: issuerId,
        verified: parsed.data.verified,
        notes,
        updated_by: req.user.id,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "issuer_id" }
    ).select("issuer_id, verified, notes, updated_at, updated_by").single();
    if (error) {
      console.error("[issuer-status] write failed:", error);
      res.status(500).json({ ok: false, error: "write_failed" });
      return;
    }
    res.json({ ok: true, status: data });
  })
);

// src/routes/onboarding.ts
import { Router as Router4 } from "express";
var onboardingRouter = Router4();
onboardingRouter.use(requireUser);
onboardingRouter.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const { data: client2 } = await sb.from("client_users").select("household_id").eq("user_id", req.user.id).maybeSingle();
    if (!client2) {
      res.status(404).json({ error: "not_a_client" });
      return;
    }
    const { error } = await sb.from("households").update({ stage: "active" }).eq("id", client2.household_id);
    if (error) {
      res.status(500).json({ error: "update_failed", detail: error.message });
      return;
    }
    res.json({ ok: true });
  })
);

// src/routes/sync.ts
import { Router as Router5 } from "express";
import { z as z3 } from "zod";

// src/lib/household-auth.ts
async function assertHouseholdAccess(sb, userId, householdId) {
  if (!userId || !householdId) return false;
  const { data: member } = await sb.from("client_users").select("household_id").eq("user_id", userId).eq("household_id", householdId).maybeSingle();
  if (member?.household_id) return true;
  const { data: owned } = await sb.from("households").select("id").eq("id", householdId).eq("advisor_id", userId).maybeSingle();
  return !!owned?.id;
}

// src/routes/sync.ts
var syncRouter = Router5();
syncRouter.use(requireUser);
var BodySchema = z3.object({
  key: z3.string().trim().min(1).max(200),
  householdId: z3.string().uuid(),
  value: z3.unknown().optional(),
  expectedVersion: z3.number().int().nonnegative().optional()
});
syncRouter.post(
  "/blob",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const parsed = validate(req.body, BodySchema, res);
    if (!parsed.ok) return;
    const { key, householdId, value, expectedVersion } = parsed.data;
    const allowed = await assertHouseholdAccess(sb, req.user.id, householdId);
    if (!allowed) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const { data, error } = await sb.rpc("upsert_client_state", {
      p_household: householdId,
      p_key: key,
      p_value: value ?? null,
      p_expected: expectedVersion ?? null
    });
    if (error) {
      const code = error.code;
      if (code === "PGRST202" || code === "42883") {
        const { error: upErr } = await sb.from("client_state").upsert(
          { household_id: householdId, state_key: key, state_value: value ?? null },
          { onConflict: "household_id,state_key" }
        );
        if (upErr) {
          res.status(500).json({ ok: false, error: "upsert_failed", detail: upErr.message });
          return;
        }
        res.json({ ok: true, version: null });
        return;
      }
      res.status(500).json({ ok: false, error: "upsert_failed", detail: error.message });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.out_conflict) {
      res.status(409).json({
        ok: false,
        error: "version_conflict",
        serverVersion: row.out_version,
        serverValue: row.out_value
      });
      return;
    }
    res.json({ ok: true, version: row?.out_version ?? null });
  })
);

// src/routes/gcal.ts
import { Router as Router6 } from "express";
import { randomBytes } from "node:crypto";
import { z as z4 } from "zod";

// ../lib/google-calendar.ts
import { google } from "googleapis";
var SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events"
];
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/gcal/callback`;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
function getAuthUrl(state) {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    // gets refresh_token
    prompt: "consent",
    // always show account picker
    scope: SCOPES,
    ...state ? { state } : {}
  });
}
async function exchangeCode(code) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}
function getCalendarClient(accessToken, refreshToken) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  return google.calendar({ version: "v3", auth: oauth2 });
}
async function fetchUpcomingEvents(accessToken, refreshToken) {
  const cal = getCalendarClient(accessToken, refreshToken);
  const now = /* @__PURE__ */ new Date();
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(now.getDate() + 30);
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: thirtyDaysLater.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50
  });
  return (res.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    description: e.description || ""
  }));
}
async function createCalendarEvent(accessToken, refreshToken, event) {
  const cal = getCalendarClient(accessToken, refreshToken);
  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startDateTime, timeZone: "Asia/Jerusalem" },
      end: { dateTime: event.endDateTime, timeZone: "Asia/Jerusalem" }
    }
  });
  return res.data;
}

// src/routes/gcal.ts
var gcalRouter = Router6();
var OAUTH_STATE_COOKIE = "gcal_oauth_state";
var crmUrl = (qs) => `${env.FRONTEND_URL}/crm${qs}`;
gcalRouter.get(
  "/auth",
  requireUser,
  (req, res) => {
    try {
      const state = randomBytes(16).toString("base64url");
      const url = getAuthUrl(state);
      res.cookie(OAUTH_STATE_COOKIE, state, crossSiteCookie(60 * 10 * 1e3));
      res.redirect(url);
    } catch {
      res.redirect(crmUrl("?gcal=error&reason=not_configured"));
    }
  }
);
gcalRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] || null;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    if (!code) return res.redirect(crmUrl("?gcal=error&reason=no_code"));
    if (!state || !expectedState || state !== expectedState) {
      return res.redirect(crmUrl("?gcal=error&reason=invalid_state"));
    }
    try {
      const tokens = await exchangeCode(code);
      if (tokens.access_token) {
        res.cookie("gcal_access_token", tokens.access_token, crossSiteCookie(60 * 60 * 1e3));
      }
      if (tokens.refresh_token) {
        res.cookie("gcal_refresh_token", tokens.refresh_token, crossSiteCookie(60 * 60 * 24 * 365 * 1e3));
      }
      res.cookie("gcal_connected", "true", crossSiteCookie(60 * 60 * 24 * 365 * 1e3, false));
      res.redirect(crmUrl("?gcal=connected"));
    } catch (e) {
      console.error("[gcal/callback] Token exchange failed:", e);
      const msg = e instanceof Error ? e.message : "exchange_failed";
      res.redirect(crmUrl(`?gcal=error&reason=${encodeURIComponent(msg)}`));
    }
  })
);
gcalRouter.use(requireUser);
gcalRouter.get("/status", (req, res) => {
  const connected = req.cookies?.gcal_connected === "true";
  const hasToken = !!req.cookies?.gcal_access_token;
  res.json({
    connected: connected && hasToken,
    hasRefreshToken: !!req.cookies?.gcal_refresh_token
  });
});
var EventSchema = z4.object({
  summary: z4.string().trim().min(1).max(500),
  description: z4.string().max(5e3).optional(),
  startDateTime: z4.string().min(1),
  endDateTime: z4.string().min(1)
});
gcalRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const accessToken = req.cookies?.gcal_access_token;
    const refreshToken = req.cookies?.gcal_refresh_token;
    if (!accessToken) {
      res.status(401).json({ error: "Not connected to Google Calendar" });
      return;
    }
    try {
      const events = await fetchUpcomingEvents(accessToken, refreshToken);
      res.json({ events });
    } catch (e) {
      console.error("[gcal/events] Fetch failed:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "fetch_failed" });
    }
  })
);
gcalRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const accessToken = req.cookies?.gcal_access_token;
    const refreshToken = req.cookies?.gcal_refresh_token;
    if (!accessToken) {
      res.status(401).json({ error: "Not connected to Google Calendar" });
      return;
    }
    const parsed = validate(req.body, EventSchema, res);
    if (!parsed.ok) return;
    try {
      const event = await createCalendarEvent(accessToken, refreshToken, {
        summary: parsed.data.summary,
        description: parsed.data.description || "",
        startDateTime: parsed.data.startDateTime,
        endDateTime: parsed.data.endDateTime
      });
      res.json({ event });
    } catch (e) {
      console.error("[gcal/events] Create failed:", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "create_failed" });
    }
  })
);
gcalRouter.post("/disconnect", (req, res) => {
  res.clearCookie("gcal_access_token", { path: "/" });
  res.clearCookie("gcal_refresh_token", { path: "/" });
  res.clearCookie("gcal_connected", { path: "/" });
  res.json({ disconnected: true });
});

// src/routes/documents.ts
import { Router as Router7 } from "express";

// ../lib/doc-parser/parse-excel.ts
import * as XLSX from "xlsx";

// ../lib/doc-parser/synonyms.ts
var SYNONYM_MAP = {
  date: [
    // Hebrew — all bank variants
    "\u05EA\u05D0\u05E8\u05D9\u05DA",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E2\u05E1\u05E7\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E2\u05E8\u05DA",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D7\u05D9\u05D5\u05D1",
    "\u05EA. \u05E2\u05E1\u05E7\u05D4",
    "\u05EA. \u05D7\u05D9\u05D5\u05D1",
    "\u05EA.\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05EA.\u05E2\u05E1\u05E7\u05D4",
    "\u05EA.\u05D7\u05D9\u05D5\u05D1",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05E2\u05E1\u05E7\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E8\u05DB\u05D9\u05E9\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05E7\u05E0\u05D9\u05D9\u05D4",
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D1\u05D9\u05E6\u05D5\u05E2",
    // Leumi specific
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D1\u05D9\u05E6\u05D5\u05E2 \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05EA.\u05D1\u05D9\u05E6\u05D5\u05E2",
    // Discount specific
    "\u05EA. \u05E2\u05E8\u05DA",
    "\u05EA.\u05E2\u05E8\u05DA",
    // Mizrahi specific
    "\u05EA\u05D0\u05E8\u05D9\u05DA \u05EA\u05E0\u05D5\u05E2\u05D4",
    // Credit card dates
    "\u05DE\u05D5\u05E2\u05D3 \u05D7\u05D9\u05D5\u05D1",
    "\u05DE\u05D5\u05E2\u05D3 \u05D4\u05E2\u05E1\u05E7\u05D4",
    "\u05DE\u05D5\u05E2\u05D3 \u05E8\u05DB\u05D9\u05E9\u05D4",
    // English
    "date",
    "trans date",
    "value date",
    "transaction date",
    "posting date"
  ],
  description: [
    // Hebrew — all bank variants.
    // NOTE: "אסמכתא" (reference number) is deliberately EXCLUDED from this
    // list even though it is a common column header. Reason: in most bank
    // exports the reference column contains pure numbers, and when a row
    // also has a real text description column (תאור/פעולה/הפעולה) the
    // first-wins column detector would otherwise latch onto אסמכתא and
    // we'd show "282130" as the transaction description. The fallback loop
    // in parseExcel picks up a non-numeric text cell automatically if no
    // description column is detected at all.
    "\u05EA\u05D9\u05D0\u05D5\u05E8",
    "\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05EA\u05D9\u05D0\u05D5\u05E8 \u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05E9\u05DD \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7",
    "\u05E4\u05E8\u05D8\u05D9\u05DD",
    "\u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05E9\u05DD \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7",
    "\u05E4\u05D9\u05E8\u05D5\u05D8",
    "\u05EA\u05D9\u05D0\u05D5\u05E8 \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05E9\u05DD \u05D4\u05E2\u05E1\u05E7",
    "\u05E9\u05DD \u05E2\u05E1\u05E7",
    "\u05D1\u05D9\u05EA \u05E2\u05E1\u05E7",
    "\u05E9\u05DD \u05D1\u05E2\u05DC \u05D4\u05E2\u05E1\u05E7",
    // Leumi specific
    "\u05E4\u05E2\u05D5\u05DC\u05D4/\u05D0\u05E1\u05DE\u05DB\u05EA\u05D0",
    "\u05EA\u05D0\u05D5\u05E8",
    "\u05E4\u05E8\u05D8\u05D9 \u05D4\u05EA\u05E0\u05D5\u05E2\u05D4",
    // Leumi HTML format
    "\u05EA\u05D9\u05D0\u05D5\u05E8 \u05D4\u05EA\u05E0\u05D5\u05E2\u05D4",
    // Hapoalim HTML format
    "\u05E1\u05D5\u05D2 \u05EA\u05E0\u05D5\u05E2\u05D4",
    "\u05E1\u05D5\u05D2 \u05D4\u05EA\u05E0\u05D5\u05E2\u05D4",
    // Mercantile / older Hapoalim
    "\u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    // Discount specific — combo column "פירוט/אסמכתא" IS a description
    "\u05E4\u05D9\u05E8\u05D5\u05D8/\u05D0\u05E1\u05DE\u05DB\u05EA\u05D0",
    // Credit card specific
    "\u05E9\u05DD \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7/\u05E4\u05D9\u05E8\u05D5\u05D8",
    '\u05E9\u05DD \u05D1\u05D9\u05D4"\u05E2',
    "\u05E9\u05DD \u05D1\u05D9\u05EA-\u05E2\u05E1\u05E7",
    "\u05DE\u05E7\u05D5\u05DD \u05D4\u05E8\u05DB\u05D9\u05E9\u05D4",
    "\u05E9\u05DD \u05E1\u05D5\u05D7\u05E8",
    // Mercantile
    "\u05EA\u05D0\u05D5\u05E8 \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4",
    // English
    "description",
    "details",
    "merchant",
    "payee",
    "narrative"
  ],
  debit: [
    // Hebrew — all bank variants
    "\u05D7\u05D5\u05D1\u05D4",
    "\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1",
    "\u05D7\u05D9\u05D5\u05D1",
    "\u05D4\u05D5\u05E6\u05D0\u05D4",
    '\u05E1\u05D4"\u05DB \u05D7\u05D9\u05D5\u05D1',
    '\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9"\u05D7',
    "\u05E1\u05DB\u05D5\u05DD \u05D4\u05E2\u05E1\u05E7\u05D4",
    "\u05E1\u05DB\u05D5\u05DD \u05DC\u05D7\u05D9\u05D5\u05D1",
    '\u05E1\u05DB\u05D5\u05DD \u05D4\u05E2\u05E1\u05E7\u05D4 \u05D1\u05E9"\u05D7',
    "\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9\u05E7\u05DC\u05D9\u05DD",
    '\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1 \u05D1\u05E9"\u05D7',
    '\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9"\u05D7 \u05DC\u05D7\u05D9\u05D5\u05D1',
    "\u05E1\u05DB\u05D5\u05DD",
    '\u05E1\u05D4"\u05DB \u05DC\u05D7\u05D9\u05D5\u05D1',
    // Leumi specific
    "\u05E1\u05DB\u05D5\u05DD",
    "\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9''\u05D7",
    // Leumi HTML format
    "\u05D1\u05D7\u05D5\u05D1\u05D4",
    // Discount combined column
    "\u20AA \u05D6\u05DB\u05D5\u05EA/\u05D7\u05D5\u05D1\u05D4",
    "\u05D6\u05DB\u05D5\u05EA/\u05D7\u05D5\u05D1\u05D4",
    // Discount specific
    "\u05DE\u05E9\u05D9\u05DB\u05D5\u05EA",
    "\u05D7\u05D5\u05D1\u05D4 / \u05DE\u05E9\u05D9\u05DB\u05D5\u05EA",
    // Mizrahi specific
    "\u05E1\u05DB\u05D5\u05DD \u05D4\u05EA\u05E0\u05D5\u05E2\u05D4",
    "\u05E1\u05DB\u05D5\u05DD \u05E4\u05E2\u05D5\u05DC\u05D4",
    // Credit card specific
    '\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1 \u05E9"\u05D7',
    "\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1 \u05D1\u05E9\u05D7",
    "\u05E1\u05DB\u05D5\u05DD \u05E2\u05E1\u05E7\u05D4 \u05D1\u05E9\u05D7",
    "\u05E1\u05DB\u05D5\u05DD \u05E2\u05E1\u05E7\u05D4",
    '\u05E1\u05DB\u05D5\u05DD \u05DC\u05D7\u05D9\u05D5\u05D1 \u05D1\u05E9"\u05D7',
    '\u05E1\u05D4"\u05DB \u05D1\u05E9"\u05D7',
    "\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9\u05E7\u05DC\u05D9\u05DD \u05D7\u05D3\u05E9\u05D9\u05DD",
    '\u05E1\u05DB\u05D5\u05DD \u05E2\u05E1\u05E7\u05D4 \u05D1\u05E9"\u05D7',
    // Isracard
    "\u05E1\u05DB\u05D5\u05DD \u05D7\u05D9\u05D5\u05D1",
    "\u05E1\u05DB\u05D5\u05DD \u05D4\u05D7\u05D9\u05D5\u05D1",
    // Cal / Visa Cal
    "\u05E1\u05DB\u05D5\u05DD \u05DC\u05EA\u05E9\u05DC\u05D5\u05DD",
    // Max (Leumi Card)
    '\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9"\u05D7',
    // English
    "debit",
    "charge",
    "amount",
    "withdrawal"
  ],
  credit: [
    // Hebrew — all bank variants
    "\u05D6\u05DB\u05D5\u05EA",
    "\u05E1\u05DB\u05D5\u05DD \u05D6\u05D9\u05DB\u05D5\u05D9",
    "\u05D6\u05D9\u05DB\u05D5\u05D9",
    "\u05D4\u05DB\u05E0\u05E1\u05D4",
    '\u05E1\u05DB\u05D5\u05DD \u05D6\u05D9\u05DB\u05D5\u05D9 \u05D1\u05E9"\u05D7',
    // Leumi HTML format
    "\u05D1\u05D6\u05DB\u05D5\u05EA",
    // Discount specific
    "\u05D4\u05E4\u05E7\u05D3\u05D5\u05EA",
    "\u05D6\u05DB\u05D5\u05EA / \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA",
    // Mizrahi
    "\u05D6\u05DB\u05D5\u05EA / \u05D4\u05DB\u05E0\u05E1\u05D5\u05EA",
    // English
    "credit",
    "refund",
    "deposit"
  ],
  balance: [
    // Hebrew — all bank variants
    "\u05D9\u05EA\u05E8\u05D4",
    "\u05D9\u05EA\u05E8\u05D4 \u05DE\u05E6\u05D8\u05D1\u05E8\u05EA",
    "\u05D9\u05EA\u05E8\u05D4 \u05D1\u05D7\u05E9\u05D1\u05D5\u05DF",
    "\u05D9\u05EA\u05E8\u05EA \u05E1\u05D2\u05D9\u05E8\u05D4",
    "\u05D9\u05EA\u05E8\u05D4 \u05DC\u05D0\u05D7\u05E8 \u05E4\u05E2\u05D5\u05DC\u05D4",
    // Discount
    "\u05D9\u05EA\u05E8\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA",
    // English
    "balance",
    "running balance",
    "closing balance"
  ]
};
var HEADER_BLACKLIST = [
  "\u05E7\u05D5\u05D3 \u05E4\u05E2\u05D5\u05DC\u05D4",
  "\u05E7\u05D5\u05D3 \u05D0\u05E1\u05DE\u05DB\u05EA\u05D0",
  "\u05E7\u05D5\u05D3 \u05EA\u05E0\u05D5\u05E2\u05D4",
  "\u05E1\u05D5\u05D2 \u05E4\u05E2\u05D5\u05DC\u05D4",
  // ambiguous — can be an action-type code, not a description
  "\u05DE\u05E1\u05E4\u05E8 \u05D0\u05E1\u05DE\u05DB\u05EA\u05D0",
  "\u05DE\u05E1\u05E4\u05E8 \u05E4\u05E2\u05D5\u05DC\u05D4",
  "\u05E2\u05E8\u05D5\u05E5 \u05D1\u05D9\u05E6\u05D5\u05E2",
  "\u05E6\u05E8\u05D5\u05E8",
  "\u05D4\u05E2\u05E8\u05D4"
];
function matchSynonymScored(raw) {
  const cleaned = raw.trim().replace(/[\u200F\u200E]/g, "").toLowerCase();
  if (!cleaned) return null;
  if (HEADER_BLACKLIST.some((b) => cleaned === b.toLowerCase())) return null;
  let best = null;
  for (const [field, synonyms] of Object.entries(SYNONYM_MAP)) {
    for (const syn of synonyms) {
      const synLow = syn.toLowerCase();
      let score = 0;
      if (cleaned === synLow) score = 2e3 + synLow.length;
      else if (cleaned.includes(synLow)) score = 1e3 + synLow.length;
      if (score > 0 && (!best || score > best.score)) {
        best = { field, score };
      }
    }
  }
  return best;
}
var CREDIT_CARD_HINTS = [
  ["\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8", ["\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8", "isracard", "\u05D9\u05E9\u05E8\u05D0 \u05DB\u05E8\u05D8"]],
  ["\u05DB\u05D0\u05DC", ["\u05DB\u05D0\u05DC", "cal-online", "\u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC", "visa cal", "\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 \u05D0\u05E9\u05E8\u05D0\u05D9 \u05DC\u05D9\u05E9\u05E8\u05D0\u05DC", "\u05DB.\u05D0.\u05DC", "cal "]],
  [
    "\u05DE\u05E7\u05E1",
    ["\u05DE\u05E7\u05E1", "-max", "max it", "max \u05D1\u05D4\u05E6\u05D3\u05E2\u05D4", "max-", "transaction-details_export_max", "leumi card", "\u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3"]
  ],
  ["\u05DC\u05D0\u05D5\u05DE\u05D9 \u05D5\u05D9\u05D6\u05D4", ["\u05D5\u05D9\u05D6\u05D4 \u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9", "\u05DC\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D5\u05D9\u05D6\u05D4"]],
  ["\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1", ["\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF", "amex", "american express", "\u05D0\u05DE\u05E7\u05E1"]],
  ["\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1", ["\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1", "diners"]]
];
var BANK_HINTS = [
  ["\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD", ["\u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD", "poalim", "bank hapoalim", "\u05D1\u05E0\u05E7 12"]],
  ["\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9", ["\u05DC\u05D0\u05D5\u05DE\u05D9", "leumi", "\u05D1\u05E0\u05E7 10", "bank leumi"]],
  ["\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8", ["\u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8", "discount", "\u05D1\u05E0\u05E7 11", "bank discount"]],
  ["\u05D1\u05E0\u05E7 \u05DE\u05D6\u05E8\u05D7\u05D9-\u05D8\u05E4\u05D7\u05D5\u05EA", ["\u05DE\u05D6\u05E8\u05D7\u05D9", "\u05D8\u05E4\u05D7\u05D5\u05EA", "mizrahi", "tefahot", "\u05D1\u05E0\u05E7 20", "umtb"]],
  ["\u05D1\u05E0\u05E7 \u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9", ["\u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9", "fibi", "international", "\u05D1\u05E0\u05E7 31"]],
  ["\u05D1\u05E0\u05E7 \u05DE\u05E8\u05DB\u05E0\u05EA\u05D9\u05DC", ["\u05DE\u05E8\u05DB\u05E0\u05EA\u05D9\u05DC", "mercantile", "\u05D1\u05E0\u05E7 17"]],
  ["\u05D1\u05E0\u05E7 \u05DE\u05E1\u05D3", ["\u05DE\u05E1\u05D3", "massad", "\u05D1\u05E0\u05E7 46"]],
  ["\u05D1\u05E0\u05E7 \u05D9\u05D4\u05D1", ["\u05D9\u05D4\u05D1", "yahav", "\u05D1\u05E0\u05E7 04"]],
  ["\u05D1\u05E0\u05E7 \u05D4\u05D3\u05D5\u05D0\u05E8", ["\u05D1\u05E0\u05E7 \u05D4\u05D3\u05D5\u05D0\u05E8", "\u05D3\u05D5\u05D0\u05E8 \u05D9\u05E9\u05E8\u05D0\u05DC", "postal bank", "\u05D1\u05E0\u05E7 09"]],
  ["\u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC", ["\u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC", "otsar hahayal", "\u05D1\u05E0\u05E7 14"]],
  ["\u05D1\u05E0\u05E7 \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", ["\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", "jerusalem", "\u05D1\u05E0\u05E7 54"]],
  ["\u05D5\u05D5\u05D0\u05DF \u05D6\u05D9\u05E8\u05D5", ["one zero", "\u05D5\u05D5\u05D0\u05DF \u05D6\u05D9\u05E8\u05D5", "1zero"]]
];
var BANK_BY_PREFIX = {
  "04": "\u05D1\u05E0\u05E7 \u05D9\u05D4\u05D1",
  "09": "\u05D1\u05E0\u05E7 \u05D4\u05D3\u05D5\u05D0\u05E8",
  "10": "\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9",
  "11": "\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8",
  "12": "\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD",
  "13": "\u05D1\u05E0\u05E7 \u05D0\u05D9\u05D2\u05D5\u05D3",
  "14": "\u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC",
  "17": "\u05D1\u05E0\u05E7 \u05DE\u05E8\u05DB\u05E0\u05EA\u05D9\u05DC",
  "20": "\u05D1\u05E0\u05E7 \u05DE\u05D6\u05E8\u05D7\u05D9-\u05D8\u05E4\u05D7\u05D5\u05EA",
  "26": "\u05D9\u05D5\u05D1\u05E0\u05E7",
  "31": "\u05D1\u05E0\u05E7 \u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9",
  "46": "\u05D1\u05E0\u05E7 \u05DE\u05E1\u05D3",
  "52": "\u05D1\u05E0\u05E7 \u05E4\u05D5\u05E2\u05DC\u05D9 \u05D0\u05D2\u05D5\u05D3\u05EA \u05D9\u05E9\u05E8\u05D0\u05DC",
  "54": "\u05D1\u05E0\u05E7 \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD",
  "68": "\u05D1\u05E0\u05E7 \u05D3\u05E7\u05E1\u05D9\u05D4"
};
function detectBankByPrefix(text) {
  const headerMatch = text.match(/חשבון[\s:]*?(\d{2})[-\s/]\d{2,4}[-\s/]/);
  if (headerMatch && BANK_BY_PREFIX[headerMatch[1]]) return BANK_BY_PREFIX[headerMatch[1]];
  const prefixMatch = text.match(/(?:^|[\s:])(\d{2})[-\s/](\d{2,4})[-\s/]/);
  if (prefixMatch && BANK_BY_PREFIX[prefixMatch[1]]) return BANK_BY_PREFIX[prefixMatch[1]];
  return null;
}
function detectBank(text, opts) {
  const lower = text.toLowerCase();
  if (!opts?.skipCreditCards) {
    for (const [name, keywords] of CREDIT_CARD_HINTS) {
      if (keywords.some((k) => lower.includes(k))) return name;
    }
  } else {
    const byPrefix2 = detectBankByPrefix(text);
    if (byPrefix2) return byPrefix2;
  }
  for (const [name, keywords] of BANK_HINTS) {
    if (keywords.some((k) => lower.includes(k))) return name;
  }
  const byPrefix = detectBankByPrefix(text);
  if (byPrefix) return byPrefix;
  return "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4";
}

// ../lib/doc-parser/number-utils.ts
function cleanAmount(raw) {
  if (raw == null) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  let s = String(raw).trim();
  s = s.replace(/[\u200F\u200E\u200B\u200C\u200D\uFEFF]/g, "");
  if (!s || s === "-" || s === "\u2014" || s === "\u2013") return 0;
  const parenMatch = s.match(/^\((.+)\)$/);
  if (parenMatch) {
    s = "-" + parenMatch[1];
  }
  if (/^[^-].*-\s*$/.test(s)) {
    s = "-" + s.replace(/-\s*$/, "");
  }
  const isNeg = s.startsWith("-") || s.startsWith("\u2212");
  s = s.replace(/[^\d.]/g, "");
  const dotParts = s.split(".");
  if (dotParts.length > 2) {
    const last = dotParts.pop();
    s = dotParts.join("") + "." + last;
  } else if (dotParts.length === 2) {
    const afterDot = dotParts[1];
    if (afterDot.length === 3 && dotParts[0].length >= 1 && dotParts[0].length <= 3) {
      s = dotParts.join("");
    }
  }
  if (!s) return 0;
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return isNeg ? -Math.abs(num) : num;
}
function parseILDate(raw) {
  if (!raw) return "";
  const s = raw.trim().replace(/[\u200F\u200E]/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const match = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (match) {
    let day = match[1].padStart(2, "0");
    let month = match[2].padStart(2, "0");
    let year = match[3];
    if (parseInt(month) > 12 && parseInt(day) <= 12) {
      [day, month] = [month, day];
    }
    if (year.length === 2) {
      const y = parseInt(year);
      year = (y >= 50 ? "19" : "20") + year;
    }
    return `${year}-${month}-${day}`;
  }
  const numVal = parseFloat(s);
  if (!isNaN(numVal) && numVal > 3e4 && numVal < 6e4) {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + numVal * 864e5);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return s;
}

// ../lib/doc-parser/parse-excel.ts
init_categorizer();

// ../lib/doc-parser/instruments.ts
init_client_scope();
var CREDIT_CARD_INSTITUTIONS = [
  "\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8",
  "\u05DB\u05D0\u05DC",
  "\u05DE\u05E7\u05E1",
  "\u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC",
  "\u05D5\u05D9\u05D6\u05D4",
  "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1",
  "\u05DC\u05D0\u05D5\u05DE\u05D9 \u05D5\u05D9\u05D6\u05D4",
  "\u05D5\u05D9\u05D6\u05D4 \u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9",
  "\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1"
];
function isCreditCardInstitution(bank) {
  return CREDIT_CARD_INSTITUTIONS.some((cc) => bank.includes(cc));
}
function extractBillingDay(text) {
  const datedRx = /(?:תאריך\s*ה?חיוב(?:\s*בחשבון)?|מועד\s*ה?חיוב|חיוב\s*ה?כרטיס|billing\s*date)\s*[:.\-]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i;
  const datedMatch = text.match(datedRx);
  if (datedMatch) {
    const day = parseInt(datedMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }
  const dayOfMonthRx = /חיוב(?:\s*חודשי)?\s*ביום\s*ה?[-\s]?(\d{1,2})\b/i;
  const domMatch = text.match(dayOfMonthRx);
  if (domMatch) {
    const day = parseInt(domMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }
  const literalDomRx = /(?:ליום|ל[-\s]?חודש)\s*ה?[-\s]?(\d{1,2})\b/i;
  const litMatch = text.match(literalDomRx);
  if (litMatch) {
    const day = parseInt(litMatch[1], 10);
    if (day >= 1 && day <= 28) return day;
  }
  return null;
}
function extractInstruments(text, bankHint) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const addUnique = (inst) => {
    const key = `${inst.type}::${inst.institution}::${inst.identifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(inst);
  };
  const isCreditCard = isCreditCardInstitution(bankHint);
  const cleaned = text.replace(/[\u200F\u200E]/g, "");
  const billingDay = isCreditCard ? extractBillingDay(cleaned) : null;
  if (!isCreditCard) {
    const accountPatterns = [
      /(?:חשבון|מספר\s*חשבון|חש['׳]|account)\s*(?:מס['\u0027׳]?\s*)?[:.]?\s*(\d{3,4}[-\/]?\d{4,9}(?:[-\/]\d{1,3})?)/gi,
      // Bank Yahav (and similar) triple-segment format "04-131-011822"
      // (bank-branch-account) — leads with a 2-digit bank code, which the
      // pattern above (requires \d{3,4} first) can't match.
      /(?:חשבון|מספר\s*חשבון|חש['׳]|account)\s*(?:מס[''׳]?\s*)?[:.]?\s*(\d{2,3}-\d{3}-\d{3,9})/gi,
      /(?:סניף)\s*\d{2,4}\s*(?:חשבון|חש['׳]?)\s*[:.]?\s*(\d{4,9})/gi,
      // Leumi header: "לאומי לישראל 806-33562048" / "806-335620/48"
      /(?:לאומי לישראל|בנק\s+\S+)\s+(\d{3,4}[-\/]\d{4,10}(?:[-\/]\d{1,3})?)/gi
    ];
    for (const rx of accountPatterns) {
      let m2;
      while ((m2 = rx.exec(cleaned)) !== null) {
        const accountNum = m2[1].replace(/\s+/g, "");
        if (accountNum.replace(/[-\/]/g, "").length >= 4 && accountNum.length <= 16) {
          addUnique({
            type: "bank_account",
            institution: bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05D1\u05E0\u05E7",
            identifier: accountNum,
            label: `${bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05D1\u05E0\u05E7"} (\u05D7\u05E9\u05D1\u05D5\u05DF ${accountNum})`
          });
        }
      }
    }
  }
  const last4Patterns = [
    // "xxxx-3014" / "XXXX3014" / "****3014" / "...3014"
    /(?:x{3,4}|X{3,4}|\*{3,4}|\.{3,4})[-\s]?(\d{4})/g,
    // "סיומת 3014" / "4 ספרות אחרונות 3014"
    /(?:סיומת|ספרות\s*אחרונות)\s*[:.]?\s*(\d{4})/gi,
    // "המסתיים ב-8645" / "המסתיים ב 8645" (Leumi Visa format)
    /המסתיים\s*ב[-\s]?(\d{4})/gi,
    // "כרטיס מס' ... 3014" / "כרטיס 1234-5678-9012-3014" — require the 4 digits
    // within ~25 chars of "כרטיס" so we don't pick up dates like "15-02-2026".
    /כרטיס\s*(?:מס['\u0027׳]?\s*)?[:.\-\s]{0,25}?(\d{4})\b/gi,
    // "card ending 3014"
    /card\s*(?:ending|ends?)\s*[:.]?\s*(\d{4})/gi,
    // MAX export header: "3428-max" / "3428 max" / "3428-max בהצדעה"
    /\b(\d{4})[-\s]max\b/gi
  ];
  for (const rx of last4Patterns) {
    let m2;
    while ((m2 = rx.exec(cleaned)) !== null) {
      const last4 = m2[1];
      const n = parseInt(last4, 10);
      if (n >= 2e3 && n <= 2099) continue;
      addUnique({
        type: "credit_card",
        institution: isCreditCard && bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D0\u05E9\u05E8\u05D0\u05D9",
        identifier: last4,
        label: `${isCreditCard && bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D0\u05E9\u05E8\u05D0\u05D9"} (\u05E1\u05D9\u05D5\u05DE\u05EA ${last4})`,
        ...billingDay != null ? { billingDay } : {}
      });
    }
  }
  const fullCardRx = /\b(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})\b/g;
  let m;
  while ((m = fullCardRx.exec(cleaned)) !== null) {
    const last4 = m[4];
    addUnique({
      type: "credit_card",
      institution: isCreditCard && bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D0\u05E9\u05E8\u05D0\u05D9",
      identifier: last4,
      label: `${isCreditCard && bankHint !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" ? bankHint : "\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D0\u05E9\u05E8\u05D0\u05D9"} (\u05E1\u05D9\u05D5\u05DE\u05EA ${last4})`,
      ...billingDay != null ? { billingDay } : {}
    });
  }
  if (isCreditCard && found.filter((f) => f.type === "credit_card").length === 0) {
    const topText = cleaned.substring(0, 500);
    const broadCardRx = /\b(\d{4})\b/g;
    const candidates = [];
    let bm;
    while ((bm = broadCardRx.exec(topText)) !== null) {
      const n = bm[1];
      if (parseInt(n) >= 1900 && parseInt(n) <= 2100) continue;
      if (n === "0000") continue;
      candidates.push(n);
    }
    if (candidates.length > 0) {
      const last4 = candidates[0];
      addUnique({
        type: "credit_card",
        institution: bankHint,
        identifier: last4,
        label: `${bankHint} (\u05E1\u05D9\u05D5\u05DE\u05EA ${last4})`,
        ...billingDay != null ? { billingDay } : {}
      });
    }
  }
  return found;
}

// ../lib/doc-parser/reconciliation.ts
function reconcile(input) {
  const { openingBalance, closingBalance, transactions } = input;
  if (openingBalance === void 0 || closingBalance === void 0) {
    return {
      ok: true,
      computed: 0,
      delta: 0,
      driftPct: 0,
      severity: "skipped",
      message: "\u05D9\u05EA\u05E8\u05D5\u05EA \u05E4\u05EA\u05D9\u05D7\u05D4/\u05E1\u05D2\u05D9\u05E8\u05D4 \u05DC\u05D0 \u05D6\u05D5\u05D4\u05D5 \u05D1\u05DE\u05E1\u05DE\u05DA \u2014 \u05DC\u05D0 \u05D1\u05D5\u05E6\u05E2\u05D4 \u05D1\u05D3\u05D9\u05E7\u05EA \u05E1\u05D9\u05DB\u05D5\u05DD"
    };
  }
  let credits = 0;
  let debits = 0;
  for (const t of transactions) {
    if (t.amount < 0) credits += Math.abs(t.amount);
    else debits += t.amount;
  }
  const computed = openingBalance + credits - debits;
  const delta = Math.round((closingBalance - computed) * 100) / 100;
  const base = Math.abs(closingBalance) || 1;
  const driftPct = Math.abs(delta) / base;
  if (Math.abs(delta) < 1) {
    return {
      ok: true,
      computed,
      delta,
      driftPct,
      severity: "clean",
      message: "\u2713 \u05D1\u05D3\u05D9\u05E7\u05EA \u05E1\u05D9\u05DB\u05D5\u05DD \u05EA\u05D5\u05D0\u05DE\u05EA 100% \u05DC\u05DE\u05E1\u05DE\u05DA \u05D4\u05DE\u05E7\u05D5\u05E8"
    };
  }
  if (driftPct < 5e-3) {
    return {
      ok: true,
      computed,
      delta,
      driftPct,
      severity: "minor",
      message: `\u26A0 \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E7\u05DC\u05D4 \u05E9\u05DC ${formatILS(delta)} (${(driftPct * 100).toFixed(2)}%) \u2014 \u05DB\u05E0\u05E8\u05D0\u05D4 \u05E2\u05D9\u05D2\u05D5\u05DC\u05D9\u05DD`
    };
  }
  return {
    ok: false,
    computed,
    delta,
    driftPct,
    severity: "major",
    message: `\u2717 \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E9\u05DC ${formatILS(delta)} (${(driftPct * 100).toFixed(2)}%) \u2014 \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05D7\u05E1\u05E8\u05D5\u05EA. \u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05D4\u05DE\u05E1\u05DE\u05DA \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9.`
  };
}
function formatILS(n) {
  return "\u20AA" + Math.abs(Math.round(n)).toLocaleString("he-IL");
}
function extractBalances(text) {
  const lines = text.split(/\r?\n/);
  let opening;
  let closing;
  const OPENING_PATTERNS = [
    /יתרת\s*פתיחה[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*התחלתית[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*קודמת[^\d\-]*(-?[\d,\.]+)/
  ];
  const CLOSING_PATTERNS = [
    /יתרת\s*סגירה[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*סופית[^\d\-]*(-?[\d,\.]+)/,
    /יתרה\s*נוכחית[^\d\-]*(-?[\d,\.]+)/
  ];
  for (const line of lines) {
    if (opening === void 0) {
      for (const re of OPENING_PATTERNS) {
        const m = line.match(re);
        if (m) {
          opening = parseNum(m[1]);
          break;
        }
      }
    }
    if (closing === void 0) {
      for (const re of CLOSING_PATTERNS) {
        const m = line.match(re);
        if (m) {
          closing = parseNum(m[1]);
          break;
        }
      }
    }
    if (opening !== void 0 && closing !== void 0) break;
  }
  return { opening, closing };
}
function parseNum(s) {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

// ../lib/doc-parser/parse-excel.ts
function stripHtmlToText(buffer) {
  const text = buffer.toString("utf8");
  if (!/<html/i.test(text.slice(0, 500))) return "";
  return text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<table[\s\S]*?<\/table>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[\u200E\u200F]/g, "").replace(/\s+/g, " ").trim();
}
function parseHtmlToRows(buffer) {
  let text = buffer.toString("utf8");
  if (!/<html/i.test(text.slice(0, 500))) return null;
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(text)) !== null) {
    const trContent = trMatch[1];
    const cells = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      let cell = tdMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[\r\n]+/g, " ").trim();
      cells.push(cell);
    }
    if (cells.length >= 2) {
      rows.push(cells);
    }
  }
  return rows.length > 0 ? rows : null;
}
function isCombinedAmountHeader(header) {
  const lower = header.trim().replace(/[\u200F\u200E]/g, "").toLowerCase();
  return ["\u05E1\u05DB\u05D5\u05DD", "amount", "\u05E1\u05DB\u05D5\u05DD \u05D4\u05E2\u05E1\u05E7\u05D4", '\u05E1\u05DB\u05D5\u05DD \u05D1\u05E9"\u05D7', "\u20AA \u05D6\u05DB\u05D5\u05EA/\u05D7\u05D5\u05D1\u05D4", "\u05D6\u05DB\u05D5\u05EA/\u05D7\u05D5\u05D1\u05D4"].includes(lower);
}
function isCreditCardBank(bankHint) {
  return [
    "\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8",
    "\u05DB\u05D0\u05DC",
    "\u05DE\u05E7\u05E1",
    "\u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC",
    "\u05D5\u05D9\u05D6\u05D4",
    "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1",
    "\u05D3\u05D9\u05D9\u05E0\u05E8\u05E1",
    "\u05DC\u05D0\u05D5\u05DE\u05D9 \u05E7\u05D0\u05E8\u05D3"
  ].some((cc) => bankHint.includes(cc));
}
function parseExcel(buffer, filename) {
  const htmlRows = parseHtmlToRows(buffer);
  const htmlMetaText = htmlRows ? stripHtmlToText(buffer) : "";
  let rows;
  if (htmlRows) {
    rows = htmlRows;
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const candidateSheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: "",
        raw: false
      })
    })).map((s) => ({
      ...s,
      nonEmpty: s.rows.filter((r) => r && r.some((c) => String(c).trim() !== "")).length
    }));
    const isSummaryName = (n) => /סיכום|summary|cover|index/i.test(n);
    let pick = candidateSheets.filter((s) => !isSummaryName(s.name)).sort((a, b) => b.nonEmpty - a.nonEmpty)[0] ?? candidateSheets.sort((a, b) => b.nonEmpty - a.nonEmpty)[0];
    rows = pick?.rows ?? [];
  }
  const warnings = [];
  let headerRowIdx = -1;
  let mapping = null;
  let hasSeparateDebitCredit = false;
  let headerRow = [];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const detected = {};
    let matchCount = 0;
    for (let col = 0; col < row.length; col++) {
      const cellText = String(row[col]).trim();
      if (!cellText) continue;
      const hit = matchSynonymScored(cellText);
      if (!hit) continue;
      if (detected[hit.field] === void 0) {
        detected[hit.field] = col;
        matchCount++;
      }
    }
    if (matchCount >= 2 && detected.date !== void 0 && (detected.description !== void 0 || detected.debit !== void 0)) {
      headerRowIdx = i;
      headerRow = row.map((c) => String(c));
      hasSeparateDebitCredit = detected.debit !== void 0 && detected.credit !== void 0;
      mapping = {
        date: detected.date ?? -1,
        description: detected.description ?? -1,
        debit: detected.debit ?? -1,
        credit: detected.credit ?? -1,
        balance: detected.balance
      };
      break;
    }
  }
  const metadataText = [
    rows.slice(0, Math.max(headerRowIdx, 0) + 1).flat().join(" "),
    htmlMetaText
  ].filter(Boolean).join(" ");
  const fullText = [rows.flat().join(" "), htmlMetaText].filter(Boolean).join(" ");
  let bankHint = detectBank(metadataText);
  if (bankHint === "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4") {
    const headerText = headerRow.join(" ").toLowerCase();
    if (headerText.includes("\u05D6\u05DB\u05D5\u05EA/\u05D7\u05D5\u05D1\u05D4") || headerText.includes("\u05E2\u05E8\u05D5\u05E5 \u05D1\u05D9\u05E6\u05D5\u05E2")) {
      bankHint = "\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8";
    } else if (headerText.includes("\u05D1\u05D7\u05D5\u05D1\u05D4") && headerText.includes("\u05D1\u05D6\u05DB\u05D5\u05EA")) {
      bankHint = "\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9";
    }
  }
  if (bankHint === "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4") {
    bankHint = detectBank(fullText, { skipCreditCards: hasSeparateDebitCredit });
  }
  const isCreditCard = isCreditCardBank(bankHint);
  if (headerRowIdx === -1 || !mapping) {
    warnings.push("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05EA\u05D4 \u05E9\u05D5\u05E8\u05EA \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u2014 \u05E0\u05E1\u05D4 \u05DC\u05D4\u05E2\u05DC\u05D5\u05EA \u05E7\u05D5\u05D1\u05E5 \u05E2\u05DD \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05D1\u05E8\u05D5\u05E8\u05D5\u05EA");
    return {
      filename,
      type: "xlsx",
      bankHint,
      transactions: [],
      totalDebit: 0,
      totalCredit: 0,
      dateRange: { from: "", to: "" },
      warnings
    };
  }
  const debitHeader = mapping.debit >= 0 ? headerRow[mapping.debit] || "" : "";
  const isCombinedColumn = !hasSeparateDebitCredit && isCombinedAmountHeader(debitHeader);
  let isMonthDayYear = false;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const raw = String(rows[i]?.[mapping.date] ?? "").trim().replace(/[\u200F\u200E]/g, "");
    const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m && parseInt(m[2]) > 12) {
      isMonthDayYear = true;
      break;
    }
  }
  const transactions = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const rawDate = String(row[mapping.date] ?? "");
    let date;
    if (isMonthDayYear) {
      const cleaned = rawDate.trim().replace(/[\u200F\u200E]/g, "");
      const dm = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (dm) {
        date = parseILDate(`${dm[2]}/${dm[1]}/${dm[3]}`);
      } else {
        date = parseILDate(rawDate);
      }
    } else {
      date = parseILDate(rawDate);
    }
    if (!date || date.length < 6) continue;
    let description = "";
    if (mapping.description >= 0) {
      description = String(row[mapping.description] ?? "").trim();
    }
    if (!description) {
      for (let col = 0; col < row.length; col++) {
        if (col === mapping.date || col === mapping.debit || col === mapping.credit) continue;
        const cell = String(row[col]).trim();
        if (cell && cell.length >= 2 && !/^[\d,.₪$\-\(\)]+$/.test(cell)) {
          description = cell;
          break;
        }
      }
    }
    if (!description) continue;
    const rawDebit = mapping.debit >= 0 ? row[mapping.debit] : void 0;
    const rawCredit = mapping.credit >= 0 ? row[mapping.credit] : void 0;
    const debitVal = cleanAmount(rawDebit);
    const creditVal = cleanAmount(rawCredit);
    let amount = 0;
    if (hasSeparateDebitCredit) {
      const hasDebit = rawDebit !== void 0 && String(rawDebit).trim() !== "" && debitVal !== 0;
      const hasCredit = rawCredit !== void 0 && String(rawCredit).trim() !== "" && creditVal !== 0;
      if (hasDebit && hasCredit) {
        amount = debitVal !== 0 ? Math.abs(debitVal) : -Math.abs(creditVal);
      } else if (hasDebit) {
        amount = Math.abs(debitVal);
      } else if (hasCredit) {
        amount = -Math.abs(creditVal);
      }
    } else if (isCreditCard) {
      if (debitVal !== 0) {
        amount = debitVal;
      } else if (creditVal !== 0) {
        amount = -Math.abs(creditVal);
      }
    } else if (isCombinedColumn) {
      amount = -debitVal;
    } else {
      if (debitVal !== 0) {
        amount = Math.abs(debitVal);
      } else if (creditVal !== 0) {
        amount = -Math.abs(creditVal);
      }
    }
    if (amount === 0) {
      for (let col = 0; col < row.length; col++) {
        if (col === mapping.date || col === mapping.description || col === mapping.debit || col === mapping.credit)
          continue;
        if (mapping.balance !== void 0 && col === mapping.balance) continue;
        const fallbackVal = cleanAmount(row[col]);
        if (fallbackVal !== 0) {
          amount = fallbackVal;
          break;
        }
      }
    }
    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw: row.join(" | ")
    });
  }
  if (transactions.length === 0 && rows.length > 1) {
    warnings.push("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D5 \u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u2014 \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05E4\u05D5\u05E8\u05DE\u05D8 \u05DC\u05D0 \u05EA\u05D5\u05D0\u05DD. \u05D1\u05D3\u05D5\u05E7 \u05E9\u05D9\u05E9 \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05D1\u05E8\u05D5\u05E8\u05D5\u05EA \u05D1\u05E7\u05D5\u05D1\u05E5.");
  }
  const totalDebit = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const instruments = extractInstruments(fullText, bankHint);
  const { opening, closing } = extractBalances(fullText);
  const reconciliation = reconcile({
    openingBalance: opening,
    closingBalance: closing,
    transactions
  });
  if (!reconciliation.ok || reconciliation.severity === "major") {
    warnings.push(reconciliation.message);
  }
  return {
    filename,
    type: "xlsx",
    bankHint,
    transactions,
    totalDebit,
    totalCredit,
    dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
    warnings,
    instruments,
    openingBalance: opening,
    closingBalance: closing,
    reconciliation: {
      ok: reconciliation.ok,
      severity: reconciliation.severity,
      message: reconciliation.message,
      delta: reconciliation.delta,
      computed: reconciliation.computed
    }
  };
}

// ../lib/doc-parser/parse-pdf.ts
import pdfParse from "pdf-parse";
init_categorizer();

// ../lib/doc-parser/cal-pdf-parser.ts
init_categorizer();
var REVERSED_DATE_END = /(\d{4}\/\d{2}\/\d{2})\s*$/;
var FIRST_AMOUNT = /-?\s?[\d,]+\.\d{2}/;
var CAL_SECTORS = [
  "\u05DE\u05D6\u05D5\u05DF \u05D5\u05DE\u05E9\u05E7\u05D0\u05D5\u05EA",
  "\u05DE\u05D6\u05D5\u05DF \u05D5\u05DE\u05E9\u05E7\u05D0",
  "\u05E8\u05DB\u05D1 \u05D5\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4",
  "\u05E8\u05DB\u05D1 \u05D5\u05EA\u05D7\u05D1\u05D5\u05E8",
  "\u05E8\u05D9\u05D4\u05D5\u05D8 \u05D5\u05D1\u05D9\u05EA",
  "\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D9\u05D9\u05E2\u05D5\u05E5",
  "\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05D9\u05D9\u05E2",
  "\u05E4\u05E0\u05D0\u05D9 \u05D1\u05D9\u05DC\u05D5\u05D9",
  "\u05D1\u05EA\u05D9 \u05DB\u05DC\u05D1\u05D5",
  "\u05DE\u05E1\u05E2\u05D3\u05D5\u05EA",
  "\u05EA\u05D9\u05D9\u05E8\u05D5\u05EA",
  "\u05D0\u05E0\u05E8\u05D2\u05D9\u05D4",
  "\u05E4\u05D9\u05E0\u05E0\u05E1\u05D9\u05DD",
  "\u05DE\u05D7\u05E9\u05D1\u05D9\u05DD",
  "\u05DE\u05D5\u05E1\u05D3\u05D5\u05EA",
  "\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA",
  "\u05D0\u05D5\u05E4\u05E0\u05D4",
  "\u05D1\u05D9\u05D2\u05D5\u05D3",
  "\u05D7\u05E9\u05DE\u05DC",
  "\u05EA\u05E7\u05E9\u05D5\u05E8\u05EA",
  "\u05D1\u05D9\u05D8\u05D5\u05D7",
  "\u05D7\u05D9\u05E0\u05D5\u05DA",
  "\u05E1\u05E4\u05D5\u05E8\u05D8",
  "\u05E9\u05D5\u05E0\u05D5\u05EA",
  "\u05DE\u05D6\u05D5\u05DF",
  "\u05D3\u05DC\u05E7"
].sort((a, b) => b.length - a.length);
function parseReversedDate(token) {
  const reversed = token.split("").reverse().join("");
  const iso = parseILDate(reversed);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}
function fixLatinRuns(s) {
  return s.replace(
    /[A-Za-z0-9][A-Za-z0-9 .,'"*&/\-]*[A-Za-z0-9]|[A-Za-z]/g,
    (run) => /[A-Za-z]/.test(run) ? run.split("").reverse().join("") : run
  );
}
function splitSectorMerchant(chunk) {
  let bestIdx = -1;
  let bestSector = "";
  for (const sector of CAL_SECTORS) {
    const idx = chunk.indexOf(sector);
    if (idx === -1) continue;
    if (bestIdx === -1 || idx < bestIdx || idx === bestIdx && sector.length > bestSector.length) {
      bestIdx = idx;
      bestSector = sector;
    }
  }
  if (bestIdx !== -1 && chunk.length > bestIdx + bestSector.length + 1) {
    return { sector: bestSector, merchant: chunk.slice(bestIdx + bestSector.length).trim() };
  }
  return { sector: "", merchant: chunk.replace(/^לא\s*/, "") };
}
function looksLikeCalStatement(text) {
  return /פירוט עסקות שנצברו/.test(text);
}
function parseCalTransactions(lines) {
  const transactions = [];
  let record = [];
  const flush = (dateToken) => {
    const date = parseReversedDate(dateToken);
    if (!date || record.length === 0) {
      record = [];
      return;
    }
    const firstLine = record[0];
    const amountMatch = firstLine.match(FIRST_AMOUNT);
    if (!amountMatch) {
      record = [];
      return;
    }
    const amount = cleanAmount(amountMatch[0]);
    let lastChunk = record[record.length - 1];
    if (!lastChunk && record.length >= 2) lastChunk = record[record.length - 2];
    if (record.length === 1) {
      const amounts = lastChunk.match(/^(\s*-?[\d,.]+\s*)?(₪|\$|EU)?\s*-?[\d,]+\.\d{2}((₪|\$|EU)\s*-?[\d,]+\.\d{2})?/);
      if (amounts) lastChunk = lastChunk.slice(amounts[0].length);
    }
    lastChunk = lastChunk.replace(/[‏‎]/g, "").trim();
    let { merchant } = splitSectorMerchant(lastChunk);
    if (merchant.length < 3 && record.length > 1) {
      const amounts = record[0].match(/^(\s*-?[\d,.]+\s*)?(₪|\$|EU)?\s*-?[\d,]+\.\d{2}((₪|\$|EU)\s*-?[\d,]+\.\d{2})?/);
      const firstTail = amounts ? record[0].slice(amounts[0].length) : record[0];
      const joined = [firstTail, ...record.slice(1)].join(" ").replace(/[‏‎]/g, "").trim();
      merchant = splitSectorMerchant(joined).merchant;
    }
    const description = fixLatinRuns(merchant).replace(/\s+/g, " ").trim();
    const raw = record.join(" ") + " " + dateToken;
    record = [];
    if (!description || amount === 0) return;
    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      // CAL convention: positive = charge/expense, negative = refund
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw
    });
  };
  let inTable = false;
  for (const line of lines) {
    if (/פירוט עסקות/.test(line)) {
      inTable = true;
      record = [];
      continue;
    }
    if (/עמוד \d+ מתוך|ט\.ל\.ח|סה"כ לתאריך/.test(line)) {
      inTable = false;
      record = [];
      continue;
    }
    if (!inTable) continue;
    const startsRecord = /^\s*₪|^\s*-?\d[\d,]*\.\d{2}/.test(line) && FIRST_AMOUNT.test(line);
    const dateMatch = line.match(REVERSED_DATE_END);
    if (record.length === 0) {
      if (!startsRecord) continue;
      record.push(dateMatch ? line.replace(REVERSED_DATE_END, "").trim() : line);
      if (dateMatch) flush(dateMatch[1]);
    } else if (dateMatch) {
      record.push(line.replace(REVERSED_DATE_END, "").trim());
      flush(dateMatch[1]);
    } else if (startsRecord) {
      record = [line];
    } else {
      record.push(line);
    }
  }
  return transactions;
}

// ../lib/doc-parser/max-pdf-parser.ts
init_categorizer();
var DATE_PREFIX = /^(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))(.*)$/;
var AMOUNT = /-?[\d,]+\.\d{2}\s*(?:₪|ILS)?/g;
var LOCAL_TYPES = ["\u05EA\u05E9\u05DC\u05D5\u05DE\u05D9\u05DD", "\u05E8\u05D2\u05D9\u05DC\u05D4", "\u05D6\u05D9\u05DB\u05D5\u05D9", "\u05E7\u05E8\u05D3\u05D9\u05D8", "\u05D3\u05D7\u05D5\u05D9"].sort(
  (a, b) => b.length - a.length
);
function stripMaxDateSuffix(rest) {
  const cleaned = rest.trim();
  if (/^\d(?=[A-Za-z\u0590-\u05FF])/.test(cleaned)) return cleaned.slice(1).trim();
  if (/^\d\s+(?=[A-Za-z\u0590-\u05FF])/.test(cleaned)) return cleaned.slice(1).trim();
  return cleaned;
}
function normalizeDescription(description) {
  return description.replace(/[\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}
function extractAmounts(text) {
  return [...text.matchAll(AMOUNT)].map((match) => cleanAmount(match[0]));
}
function parseLocalRow(date, rest, raw) {
  let type = "";
  let typeIndex = -1;
  for (const candidate of LOCAL_TYPES) {
    const idx = rest.indexOf(candidate);
    if (idx === -1) continue;
    if (typeIndex === -1 || idx < typeIndex) {
      typeIndex = idx;
      type = candidate;
    }
  }
  if (typeIndex <= 0) return null;
  const description = normalizeDescription(rest.slice(0, typeIndex));
  const tail = rest.slice(typeIndex + type.length);
  const amounts = extractAmounts(tail);
  if (!description || amounts.length === 0) return null;
  const chargeAmount = amounts.length >= 2 ? amounts[1] : amounts[0];
  if (chargeAmount === 0) return null;
  const isCredit = type === "\u05D6\u05D9\u05DB\u05D5\u05D9" || /זיכוי|החזר/.test(raw);
  const cat = categorize(description);
  return {
    date,
    description,
    amount: isCredit ? -Math.abs(chargeAmount) : Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw
  };
}
function parseForeignRow(date, rest, raw) {
  const amounts = extractAmounts(rest);
  if (amounts.length < 2) return null;
  const firstAmount = rest.search(AMOUNT);
  if (firstAmount <= 0) return null;
  const description = normalizeDescription(rest.slice(0, firstAmount));
  if (!description) return null;
  const chargeAmount = amounts[amounts.length - 1];
  if (chargeAmount === 0) return null;
  const cat = categorize(description);
  return {
    date,
    description,
    amount: Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw
  };
}
function extractTransferRecipient(line) {
  const match = line.match(/^הועבר ל:\s*(.+?)\.?$/);
  return normalizeDescription(match?.[1] ?? "");
}
function canAttachTransferRecipient(tx) {
  if (!tx) return false;
  return /BIT|PAYBOX|העברה ב/i.test(tx.description);
}
function looksLikeMaxStatement(text) {
  return /פירוט החיובים בחשבון/.test(text) && /\bmax\b|MAX|עסקות בארץ \/ בש"ח/.test(text);
}
function parseMaxTransactions(lines) {
  const transactions = [];
  let inLocalTable = false;
  let inForeignTable = false;
  for (const line of lines) {
    if (/עסקות בחו"ל \/ במטבע זר/.test(line)) {
      inForeignTable = true;
      inLocalTable = false;
      continue;
    }
    if (/עסקות בארץ \/ בש"ח/.test(line)) {
      inLocalTable = true;
      inForeignTable = false;
      continue;
    }
    if (/סה"כ חיובים בתאריך/.test(line)) {
      inLocalTable = false;
      inForeignTable = false;
      continue;
    }
    if (!inLocalTable && !inForeignTable) continue;
    const dateMatch = line.match(DATE_PREFIX);
    if (!dateMatch) {
      const recipient = inLocalTable ? extractTransferRecipient(line) : "";
      const last = transactions[transactions.length - 1];
      if (recipient && canAttachTransferRecipient(last) && !last.description.includes(recipient)) {
        last.description = `${last.description} - ${recipient}`;
        last.raw = `${last.raw ?? ""} ${line}`.trim();
      }
      continue;
    }
    const date = parseILDate(dateMatch[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const rest = stripMaxDateSuffix(dateMatch[2]);
    const tx = inLocalTable ? parseLocalRow(date, rest, line) : parseForeignRow(date, rest, line);
    if (tx) transactions.push(tx);
  }
  return transactions;
}

// ../lib/doc-parser/amex-pdf-parser.ts
init_categorizer();
var DATE_PREFIX2 = /^(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\s+(.+)$/;
var AMOUNT2 = /-?[\d,]+\.\d{2}/g;
var PRESENTATION_PREFIX = /^(?:לא הוצג|הוצג)\s+/;
var AMEX_SECTORS = [
  "\u05E9\u05D9\u05D5\u05D5\u05E7 \u05D9\u05E9\u05D9\u05E8",
  "\u05D1\u05EA\u05D9 \u05DB\u05DC\u05D1\u05D5",
  "\u05DE\u05E1\u05E2\u05D3\u05D5\u05EA",
  "\u05EA\u05D9\u05D9\u05E8\u05D5\u05EA",
  "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4",
  "\u05E8\u05DB\u05D9\u05E9\u05D5\u05EA",
  "\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD",
  "\u05EA\u05E7\u05E9\u05D5\u05E8\u05EA",
  "\u05D1\u05D9\u05D8\u05D5\u05D7",
  "\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA",
  "\u05D0\u05D5\u05E4\u05E0\u05D4",
  "\u05DE\u05D6\u05D5\u05DF",
  "\u05D3\u05DC\u05E7"
].sort((a, b) => b.length - a.length);
function normalizeDescription2(description) {
  return description.replace(/[\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}
function extractAmounts2(text) {
  return [...text.matchAll(AMOUNT2)].map((match) => cleanAmount(match[0]));
}
function stripPresentationAndSector(rest) {
  let chunk = rest.replace(PRESENTATION_PREFIX, "").trim();
  for (const sector of AMEX_SECTORS) {
    if (chunk.startsWith(`${sector} `)) return chunk.slice(sector.length).trim();
  }
  return chunk;
}
function parseAmexRow(line) {
  const match = line.match(DATE_PREFIX2);
  if (!match) return null;
  const date = parseILDate(match[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = match[2];
  const amounts = extractAmounts2(rest);
  if (amounts.length < 2) return null;
  const firstAmountIndex = rest.search(AMOUNT2);
  if (firstAmountIndex <= 0) return null;
  const description = normalizeDescription2(stripPresentationAndSector(rest.slice(0, firstAmountIndex)));
  if (!description) return null;
  const chargeAmount = amounts[amounts.length - 1];
  if (chargeAmount === 0) return null;
  const isCredit = /זוכו|זיכוי|החזר/.test(line);
  const cat = categorize(description);
  return {
    date,
    description,
    amount: isCredit ? -Math.abs(chargeAmount) : Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw: line
  };
}
function looksLikeAmexStatement(text) {
  return /אמריקן אקספרס/.test(text) && /עסקות שחויבו \/ זוכו/.test(text);
}
function parseAmexTransactions(lines) {
  const transactions = [];
  let inTransactionsTable = false;
  for (const line of lines) {
    if (/עסקות שחויבו \/ זוכו/.test(line)) {
      inTransactionsTable = true;
      continue;
    }
    if (/סה"כ חיוב לתאריך|מסגרת הכרטיס|עמוד \d+ מתוך/.test(line)) {
      inTransactionsTable = false;
      continue;
    }
    if (!inTransactionsTable) continue;
    const tx = parseAmexRow(line);
    if (tx) transactions.push(tx);
  }
  return transactions;
}

// ../lib/doc-parser/isracard-pdf-parser.ts
init_categorizer();
var DATE_END = /(\d{1,2}\.\d{1,2}\.\d{2,4})\s*$/;
var SHEKEL_AMOUNT = /₪\s*-?[\d,]+(?:\.\d{2})?/g;
function normalizeDescription3(description) {
  return description.replace(/[\u200E\u200F]/g, "").replace(/\s+/g, " ").trim();
}
function parseIsracardRow(line) {
  const dateMatch = line.match(DATE_END);
  if (!dateMatch) return null;
  const date = parseILDate(dateMatch[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const beforeDate = line.slice(0, dateMatch.index).trim();
  const amountMatches = [...beforeDate.matchAll(SHEKEL_AMOUNT)];
  if (amountMatches.length < 2) return null;
  const chargeMatch = amountMatches[amountMatches.length - 2];
  const transactionMatch = amountMatches[amountMatches.length - 1];
  const chargeAmount = cleanAmount(chargeMatch[0]);
  if (chargeAmount === 0) return null;
  const merchantStart = (transactionMatch.index ?? 0) + transactionMatch[0].length;
  const description = normalizeDescription3(beforeDate.slice(merchantStart));
  if (!description) return null;
  const isCredit = /זיכוי|החזר/.test(line) || chargeAmount < 0;
  const cat = categorize(description);
  return {
    date,
    description,
    amount: isCredit ? -Math.abs(chargeAmount) : Math.abs(chargeAmount),
    category: cat.key,
    categoryLabel: cat.label,
    confidence: cat.confidence,
    raw: line
  };
}
function looksLikeIsracardStatement(text) {
  return /ישראכרט|מסטרקארד|Mastercard|גולד\s*-\s*מסטרקארד/.test(text) && /עסקאות למועד חיוב/.test(text);
}
function parseIsracardTransactions(lines) {
  const transactions = [];
  let inTransactionsTable = false;
  for (const line of lines) {
    if (/עסקאות למועד חיוב/.test(line)) {
      inTransactionsTable = true;
      continue;
    }
    if (/סה["״']?כ לחיוב החודש בכרטיס|תנאים משפטיים|משפטייםתנאים/.test(line)) {
      inTransactionsTable = false;
      continue;
    }
    if (!inTransactionsTable) continue;
    const tx = parseIsracardRow(line);
    if (tx) transactions.push(tx);
  }
  return transactions;
}

// ../lib/doc-parser/yahav-pdf-parser.ts
init_categorizer();
var PDFJS_BUILDS = [
  "pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js",
  "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js",
  "pdf-parse/lib/pdf.js/v1.10.88/build/pdf.js"
];
function loadPdfjs() {
  for (const build of PDFJS_BUILDS) {
    try {
      return __require(build);
    } catch {
    }
  }
  return null;
}
function looksLikeYahavStatement(text) {
  const hasHeader = /תנועות.{0,4}עו["'״]?ש/.test(text);
  const hasColumns = /יתרה\s*משוערכת/.test(text) && /חובה/.test(text) && /זכות/.test(text);
  const isYahav = /יהב|yahav/i.test(text) || /\b04-\d{3}-\d{3,}/.test(text);
  return hasHeader && hasColumns && isYahav;
}
function columnOf(x) {
  if (x < 130) return "balance";
  if (x < 195) return "credit";
  if (x < 300) return "debit";
  if (x < 600) return "desc";
  if (x < 700) return "ref";
  if (x < 760) return "valueDate";
  return "date";
}
var NUMERIC = /^[\d,]+\.?\d*$/;
var DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
function normalize(s) {
  return s.replace(/[‏‎]/g, "").replace(/\s+/g, " ").trim();
}
async function parseYahavTransactions(buffer) {
  const pdfjs = loadPdfjs();
  if (!pdfjs?.getDocument) return [];
  let doc;
  try {
    const data = new Uint8Array(buffer);
    doc = await pdfjs.getDocument({ data }).promise;
  } catch {
    return [];
  }
  const rows = /* @__PURE__ */ new Map();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = String(item.str ?? "");
      if (!str.trim()) continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const key = `${p}:${y}`;
      const bucket = rows.get(key);
      if (bucket) bucket.push({ x, str });
      else rows.set(key, [{ x, str }]);
    }
  }
  const transactions = [];
  const orderedKeys = [...rows.keys()].sort((a, b) => {
    const [pa, ya] = a.split(":").map(Number);
    const [pb, yb] = b.split(":").map(Number);
    return pa !== pb ? pa - pb : yb - ya;
  });
  for (const key of orderedKeys) {
    const cells = rows.get(key).sort((a, b) => a.x - b.x);
    const buckets2 = {
      credit: [],
      debit: [],
      desc: [],
      ref: [],
      date: []
    };
    for (const cell of cells) {
      const col = columnOf(cell.x);
      if (col === "credit") buckets2.credit.push(cell.str.trim());
      else if (col === "debit") buckets2.debit.push(cell.str.trim());
      else if (col === "desc") buckets2.desc.push(cell);
      else if (col === "ref") buckets2.ref.push(cell.str.trim());
      else if (col === "date") buckets2.date.push(cell.str.trim());
    }
    const dateRaw = buckets2.date.find((s) => DATE.test(s));
    if (!dateRaw) {
      const last = transactions[transactions.length - 1];
      const refFrag = buckets2.ref.join("");
      if (last && refFrag && /\d/.test(refFrag)) last.raw = `${last.raw ?? ""} ${refFrag}`.trim();
      continue;
    }
    const date = parseILDate(dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const description = normalize(
      buckets2.desc.sort((a, b) => b.x - a.x).map((c) => c.str).join(" ")
    );
    if (!description) continue;
    const credit = cleanAmount(buckets2.credit.find((s) => NUMERIC.test(s) && s !== "0") ?? "0");
    const debit = cleanAmount(buckets2.debit.find((s) => NUMERIC.test(s) && s !== "0") ?? "0");
    let amount = 0;
    if (debit !== 0) amount = Math.abs(debit);
    else if (credit !== 0) amount = -Math.abs(credit);
    else continue;
    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw: `${dateRaw} ${description} ${buckets2.ref.join("")}`.trim()
    });
  }
  return transactions;
}

// ../lib/doc-parser/parse-pdf.ts
function extractNumbers(text) {
  const results = [];
  const numberRegex = /[-−]?\s*[₪$]?\s*[\d,]+\.?\d*[-−]?|\([₪$]?\s*[\d,]+\.?\d*\)/g;
  let m;
  const phoneOrIdRegex = /^0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/;
  while ((m = numberRegex.exec(text)) !== null) {
    const raw = m[0].trim();
    const digitsOnly = raw.replace(/[^\d]/g, "");
    if (phoneOrIdRegex.test(raw.replace(/[^\d-\s]/g, ""))) continue;
    if (digitsOnly.length >= 8 && !raw.includes(",") && !raw.includes(".") && !raw.includes("\u20AA"))
      continue;
    const val = cleanAmount(raw);
    if (val !== 0 || /\d/.test(raw)) {
      if (Math.abs(val) < 1 && Math.abs(val) !== 0) continue;
      results.push({ value: val, start: m.index, end: m.index + m[0].length });
    }
  }
  return results;
}
async function parsePDF(buffer, filename) {
  const warnings = [];
  let text;
  try {
    const result = await pdfParse(buffer);
    text = result.text;
  } catch {
    const { parsePDFWithVision: parsePDFWithVision2 } = await Promise.resolve().then(() => (init_vision_pdf_parser(), vision_pdf_parser_exports));
    return parsePDFWithVision2(buffer, filename);
  }
  const hasDebitCreditColumns = /חובה.*זכות|זכות.*חובה|debit.*credit|credit.*debit/i.test(text);
  const bankHint = detectBank(text, { skipCreditCards: hasDebitCreditColumns });
  const isCreditCard = ["\u05D9\u05E9\u05E8\u05D0\u05DB\u05E8\u05D8", "\u05DB\u05D0\u05DC", "\u05DE\u05E7\u05E1", "\u05D5\u05D9\u05D6\u05D4 \u05DB\u05D0\u05DC", "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05E7\u05E1\u05E4\u05E8\u05E1"].some(
    (cc) => bankHint.includes(cc)
  );
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const dateRegex = /^(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/;
  let transactions = [];
  if (looksLikeCalStatement(text)) {
    transactions = parseCalTransactions(lines);
  }
  if (transactions.length === 0 && looksLikeMaxStatement(text)) {
    transactions = parseMaxTransactions(lines);
  }
  if (transactions.length === 0 && looksLikeAmexStatement(text)) {
    transactions = parseAmexTransactions(lines);
  }
  if (transactions.length === 0 && looksLikeIsracardStatement(text)) {
    transactions = parseIsracardTransactions(lines);
  }
  if (transactions.length === 0 && looksLikeYahavStatement(text)) {
    transactions = await parseYahavTransactions(buffer);
  }
  for (const line of transactions.length > 0 ? [] : lines) {
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;
    const date = parseILDate(dateMatch[1]);
    if (!date) continue;
    const rest = line.substring(dateMatch[0].length).trim();
    const numPositions = extractNumbers(rest);
    if (numPositions.length === 0) continue;
    const firstNumPos = numPositions[0]?.start ?? rest.length;
    const description = rest.substring(0, firstNumPos).trim().replace(/[\u200F\u200E]/g, "").replace(/\s+/g, " ");
    if (!description || description.length < 2) continue;
    let amount = 0;
    if (hasDebitCreditColumns && numPositions.length >= 2) {
      const debit = numPositions[0].value;
      const credit = numPositions[1].value;
      if (debit !== 0 && credit === 0) {
        amount = Math.abs(debit);
      } else if (credit !== 0 && debit === 0) {
        amount = -Math.abs(credit);
      } else if (debit !== 0) {
        amount = Math.abs(debit);
      }
    } else if (isCreditCard) {
      const ilsAmount = numPositions[numPositions.length - 1].value;
      amount = Math.abs(ilsAmount);
    } else if (numPositions.length >= 2) {
      const first = numPositions[0].value;
      const second = numPositions[1].value;
      if (first !== 0 && second === 0) {
        amount = Math.abs(first);
      } else if (second !== 0 && first === 0) {
        amount = -Math.abs(second);
      } else {
        amount = Math.abs(first);
      }
    } else {
      amount = numPositions[0].value;
    }
    const cat = categorize(description);
    transactions.push({
      date,
      description,
      amount,
      category: cat.key,
      categoryLabel: cat.label,
      confidence: cat.confidence,
      raw: line
    });
  }
  if (transactions.length === 0) {
    const { parsePDFWithVision: parsePDFWithVision2 } = await Promise.resolve().then(() => (init_vision_pdf_parser(), vision_pdf_parser_exports));
    return parsePDFWithVision2(buffer, filename);
  }
  const totalDebit = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const instruments = extractInstruments(text, bankHint);
  const { opening, closing } = extractBalances(text);
  const reconciliation = reconcile({
    openingBalance: opening,
    closingBalance: closing,
    transactions
  });
  if (!reconciliation.ok || reconciliation.severity === "major") {
    warnings.push(reconciliation.message);
  }
  return {
    filename,
    type: "pdf",
    bankHint,
    transactions,
    totalDebit,
    totalCredit,
    dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
    warnings,
    instruments,
    openingBalance: opening,
    closingBalance: closing,
    reconciliation: {
      ok: reconciliation.ok,
      severity: reconciliation.severity,
      message: reconciliation.message,
      delta: reconciliation.delta,
      computed: reconciliation.computed
    }
  };
}

// ../lib/doc-parser/index.ts
init_categorizer();
init_normalizer();
init_merchant_category_rules();

// ../lib/doc-parser/dedup.ts
init_normalizer();
function fingerprint(tx) {
  const date = tx.date || "";
  const amount = Math.abs(Math.round(tx.amount * 100));
  const supplier = normalizeSupplier(tx.description).toLowerCase().replace(/[\u200F\u200E"]/g, "").replace(/\s+/g, " ").trim().substring(0, 20);
  return `${date}|${amount}|${supplier}`;
}
function deduplicateTransactions(txArrays) {
  const seen = /* @__PURE__ */ new Map();
  let duplicatesRemoved = 0;
  const sourceFiles = [];
  for (const { transactions, sourceFile } of txArrays) {
    sourceFiles.push(sourceFile);
    for (const tx of transactions) {
      const fp = fingerprint(tx);
      const existing = seen.get(fp);
      if (existing) {
        if (tx.description.length > (existing.description?.length || 0)) {
          seen.set(fp, { ...tx, _sourceFile: sourceFile });
        }
        duplicatesRemoved++;
      } else {
        seen.set(fp, { ...tx, _sourceFile: sourceFile });
      }
    }
  }
  const merged = [...seen.values()].map(({ _sourceFile, ...tx }) => tx);
  merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { merged, duplicatesRemoved, sourceFiles };
}

// ../lib/doc-parser/sub-categories.ts
init_client_scope();
var HOUSING = {
  key: "housing_sub",
  label: "\u05D3\u05D9\u05D5\u05E8",
  icon: "home",
  bucket: "fixed",
  keywords: [
    "\u05E9\u05DB\u05D9\u05E8\u05D5\u05EA",
    '\u05E9\u05DB"\u05D3',
    "\u05DE\u05E9\u05DB\u05E0\u05EA\u05D0",
    "\u05D5\u05E2\u05D3 \u05D1\u05D9\u05EA",
    "\u05D5\u05E2\u05D3 \u05D4\u05D1\u05D9\u05EA",
    "\u05D3\u05D9\u05E8\u05D4",
    "\u05E9\u05D9\u05E4\u05D5\u05E5",
    "\u05E2\u05DE\u05D9\u05D3\u05E8",
    "\u05D1\u05E0\u05E7 \u05D0\u05D3\u05E0\u05D9\u05DD"
  ],
  categoryKeys: ["housing"]
};
var HOME_BILLS = {
  key: "home_bills",
  label: "\u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05D1\u05D9\u05EA",
  icon: "bolt",
  bucket: "fixed",
  keywords: [
    "\u05D0\u05E8\u05E0\u05D5\u05E0\u05D4",
    "\u05D7\u05E9\u05DE\u05DC",
    "\u05D7\u05D1' \u05D7\u05E9\u05DE\u05DC",
    "\u05D7\u05D1\u05E8\u05EA \u05D7\u05E9\u05DE\u05DC",
    "iec",
    "\u05DE\u05D9\u05DD",
    "\u05DE\u05D9 \u05D0\u05D1\u05D9\u05D1\u05D9\u05DD",
    "\u05DE\u05D9 \u05E9\u05D1\u05E2",
    "\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA",
    "\u05D2\u05D9\u05D7\u05D5\u05DF",
    "\u05D2\u05D6",
    "\u05E2\u05D9\u05E8\u05D9\u05D9\u05EA",
    "\u05E2\u05D9\u05E8\u05D9\u05D9\u05D4",
    "israel electric"
  ],
  categoryKeys: ["utilities"]
};
var TELECOM = {
  key: "telecom",
  label: "\u05EA\u05E7\u05E9\u05D5\u05E8\u05EA",
  icon: "smartphone",
  bucket: "fixed",
  keywords: [
    "\u05D1\u05D6\u05E7",
    "\u05E4\u05E8\u05D8\u05E0\u05E8",
    "\u05E1\u05DC\u05E7\u05D5\u05DD",
    "\u05D4\u05D5\u05D8",
    "cellcom",
    "012",
    "013",
    "bezeq",
    "hot net",
    "\u05D4\u05D5\u05D8 \u05DE\u05D5\u05D1\u05D9\u05D9\u05DC",
    "yes",
    "\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8",
    "\u05E1\u05DC\u05D5\u05DC\u05E8",
    "\u05E0\u05D8\u05E4\u05DC\u05D9\u05E7\u05E1",
    "netflix",
    "\u05E1\u05E4\u05D5\u05D8\u05D9\u05E4\u05D9\u05D9",
    "spotify",
    "\u05D0\u05E4\u05DC \u05DE\u05D9\u05D5\u05D6\u05D9\u05E7",
    "apple",
    "\u05D3\u05D9\u05E1\u05E0\u05D9",
    "disney",
    "hbo",
    "\u05D0\u05DE\u05D6\u05D5\u05DF \u05E4\u05E8\u05D9\u05D9\u05DD",
    "amazon prime",
    "google storage",
    "icloud",
    "dropbox",
    "zoom",
    "microsoft 365",
    "canva",
    "adobe",
    "chatgpt",
    "openai",
    "\u05DE\u05E0\u05D5\u05D9",
    "\u05D7\u05D5\u05D3\u05E9\u05D9"
  ],
  categoryKeys: ["subscriptions"]
};
var INSURANCE = {
  key: "insurance_sub",
  label: "\u05D1\u05D9\u05D8\u05D5\u05D7\u05D9\u05DD",
  icon: "shield",
  bucket: "fixed",
  keywords: [
    "\u05D1\u05D9\u05D8\u05D5\u05D7",
    "\u05DE\u05D2\u05D3\u05DC",
    "\u05D4\u05E8\u05D0\u05DC",
    "\u05DB\u05DC\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7",
    "\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1",
    "\u05DE\u05E0\u05D5\u05E8\u05D4",
    "\u05D0\u05D9\u05D9\u05DC\u05D5\u05DF",
    "\u05E9\u05DC\u05DE\u05D4 \u05D1\u05D9\u05D8\u05D5\u05D7",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05D0\u05D5\u05DE\u05D9",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D7\u05D9\u05D9\u05DD",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05E8\u05DB\u05D1",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D3\u05D9\u05E8\u05D4"
  ],
  categoryKeys: ["insurance"]
};
var EDU_FIXED = {
  key: "edu_fixed",
  label: "\u05D7\u05D9\u05E0\u05D5\u05DA \u05E7\u05D1\u05D5\u05E2",
  icon: "school",
  bucket: "fixed",
  keywords: [
    "\u05D2\u05DF \u05D9\u05DC\u05D3\u05D9\u05DD",
    "\u05D2\u05DF",
    "\u05D1\u05D9\u05EA \u05E1\u05E4\u05E8",
    "\u05E6\u05D4\u05E8\u05D5\u05DF",
    "\u05DE\u05E2\u05D5\u05DF",
    "\u05D7\u05D5\u05D2",
    "\u05E9\u05D9\u05E2\u05D5\u05E8",
    "\u05E7\u05D9\u05D9\u05D8\u05E0\u05D4",
    "\u05E9\u05DB\u05E8 \u05DC\u05D9\u05DE\u05D5\u05D3",
    "\u05D0\u05D5\u05E0\u05D9\u05D1\u05E8\u05E1\u05D9\u05D8\u05D4",
    "\u05DE\u05DB\u05DC\u05DC\u05D4",
    "\u05E7\u05D5\u05E8\u05E1",
    "\u05D4\u05E8\u05E9\u05DE\u05D4",
    "\u05D8\u05E8\u05D5\u05DD \u05D7\u05D5\u05D1\u05D4"
  ],
  categoryKeys: ["education"]
};
var PENSION_FIXED = {
  key: "pension_fixed",
  label: "\u05E4\u05E0\u05E1\u05D9\u05D4 \u05D5\u05D7\u05D9\u05E1\u05DB\u05D5\u05DF",
  icon: "savings",
  bucket: "fixed",
  keywords: ["\u05E4\u05E0\u05E1\u05D9\u05D4", "\u05D2\u05DE\u05DC", "\u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA", "\u05D4\u05E4\u05E8\u05E9\u05D4", "\u05E4\u05D9\u05E6\u05D5\u05D9\u05D9\u05DD", "\u05DE\u05D9\u05D8\u05D1 \u05D3\u05E9", "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8", "\u05DE\u05D5\u05E8", "\u05E4\u05E1\u05D2\u05D5\u05EA"],
  categoryKeys: ["pension"]
};
var FEES_FIXED = {
  key: "fees_fixed",
  label: "\u05E2\u05DE\u05DC\u05D5\u05EA \u05D5\u05E8\u05D9\u05D1\u05D9\u05D5\u05EA",
  icon: "receipt_long",
  bucket: "fixed",
  keywords: [
    "\u05E2\u05DE\u05DC\u05D4",
    "\u05D3\u05DE\u05D9 \u05DB\u05E8\u05D8\u05D9\u05E1",
    "\u05E8\u05D9\u05D1\u05D9\u05EA",
    "\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC \u05D7\u05E9\u05D1\u05D5\u05DF",
    "\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC",
    "\u05E2\u05DE\u05DC\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4",
    "\u05D3\u05DE\u05D9 \u05E9\u05D9\u05DE\u05D5\u05E9",
    "\u05E2\u05DE\u05DC\u05EA \u05D4\u05DE\u05E8\u05D4",
    "\u05E2\u05DE\u05DC\u05EA \u05D4\u05E2\u05D1\u05E8\u05D4",
    "\u05D3\u05DE\u05D9 \u05D7\u05D9\u05D5\u05D1",
    "\u05E8\u05D9\u05D1\u05D9\u05EA \u05D7\u05D5\u05D1\u05D4",
    "\u05E8\u05D9\u05D1\u05D9\u05EA \u05E4\u05D9\u05D2\u05D5\u05E8\u05D9\u05DD",
    "\u05E2\u05DE\u05DC\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1",
    "\u05D3\u05DE\u05D9 \u05DB\u05E1\u05E4\u05D5\u05DE\u05D8",
    "\u05E2\u05DE\u05DC\u05EA \u05D1\u05E0\u05E7"
  ],
  categoryKeys: ["fees"]
};
var GROCERY = {
  key: "grocery",
  label: "\u05DE\u05D6\u05D5\u05DF \u05D5\u05E6\u05E8\u05D9\u05DB\u05D4",
  icon: "shopping_cart",
  bucket: "variable",
  keywords: [
    "\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC",
    "\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9",
    "\u05DE\u05D2\u05D4",
    "\u05DE\u05D2\u05D4 \u05D1\u05E2\u05D9\u05E8",
    "\u05DE\u05D2\u05D4 \u05D1\u05D5\u05DC",
    "\u05D9\u05D5\u05D7\u05E0\u05E0\u05D5\u05E3",
    "\u05D7\u05E6\u05D9 \u05D7\u05D9\u05E0\u05DD",
    "\u05D0\u05D5\u05E9\u05E8 \u05E2\u05D3",
    "\u05D8\u05D9\u05D1 \u05D8\u05E2\u05DD",
    "\u05D5\u05D9\u05E7\u05D8\u05D5\u05E8\u05D9",
    "\u05E1\u05D5\u05E4\u05E8 \u05E1\u05D5\u05DC",
    "\u05E4\u05E8\u05E9 \u05DE\u05E8\u05E7\u05D8",
    "\u05E1\u05D5\u05E4\u05E8 \u05D1\u05E8\u05E7\u05EA",
    "\u05D6\u05D5\u05DC \u05D5\u05D1\u05D2\u05D3\u05D5\u05DC",
    "\u05DE\u05D7\u05E1\u05E0\u05D9 \u05D4\u05E9\u05D5\u05E7",
    "\u05E1\u05D5\u05E4\u05E8 \u05D3\u05D5\u05E9",
    "\u05E7\u05D9\u05E0\u05D2 \u05E1\u05D8\u05D5\u05E8",
    "\u05E9\u05D5\u05E7",
    "\u05DE\u05DB\u05D5\u05DC\u05EA",
    "\u05D9\u05E8\u05E7\u05D5\u05EA",
    "\u05E4\u05D9\u05E8\u05D5\u05EA",
    "am:pm",
    "yellow",
    "\u05DB\u05DC \u05D1\u05D5",
    "\u05EA\u05E0\u05D5\u05D1\u05D4",
    "\u05D8\u05E8\u05D4",
    "\u05E9\u05D8\u05E8\u05D0\u05D5\u05E1",
    "\u05D0\u05E1\u05DD",
    "\u05E2\u05DC\u05D9\u05EA",
    "\u05DE\u05D0\u05E4\u05D9\u05D9\u05D4",
    "\u05DC\u05D7\u05DD \u05D0\u05E8\u05D6",
    "\u05D0\u05E0\u05D2\u05DC\u05E1",
    "\u05E8\u05D5\u05DC\u05D3\u05D9\u05DF",
    "\u05E0\u05D9\u05E7\u05D9\u05D5\u05DF",
    "\u05DE\u05E8\u05E7\u05D7\u05EA"
    // Note: סופר-פארם is in HEALTH_VAR, not here — prevents conflict
  ],
  categoryKeys: ["food"]
};
var TRANSPORT_VAR = {
  key: "transport_var",
  label: "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4",
  icon: "directions_car",
  bucket: "variable",
  keywords: [
    // ── Gas ──
    "\u05E4\u05D6",
    "\u05D3\u05DC\u05E7",
    "\u05E1\u05D5\u05E0\u05D5\u05DC",
    "\u05D3\u05D5\u05E8 \u05D0\u05DC\u05D5\u05DF",
    "ten",
    "\u05D0\u05DC\u05D5\u05DF",
    "\u05D3\u05DC\u05E7 \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4",
    "\u05EA\u05E2\u05DD+",
    // ── Parking ──
    "\u05D7\u05E0\u05D9\u05D4",
    "\u05D7\u05E0\u05D9\u05D5\u05DF",
    "\u05E4\u05E0\u05D2\u05D5",
    "\u05E1\u05DC\u05D5\u05E4\u05D0\u05E8\u05E7",
    "cellopark",
    // ── Public transport ──
    "\u05D0\u05D2\u05D3",
    "\u05D3\u05DF",
    "\u05E8\u05DB\u05D1\u05EA",
    "\u05E8\u05DB\u05D1\u05EA \u05D9\u05E9\u05E8\u05D0\u05DC",
    "\u05E7\u05D5 \u05E7\u05D5\u05D5\u05D9\u05DD",
    "\u05DE\u05D8\u05E8\u05D5\u05E4\u05D5\u05DC\u05D9\u05DF",
    "\u05E8\u05D1 \u05E7\u05D5",
    "rav kav",
    "\u05E0\u05EA\u05D9\u05D1\u05D9 \u05D0\u05D9\u05D9\u05DC\u05D5\u05DF",
    "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA",
    // ── Taxis ──
    "\u05DE\u05D5\u05E0\u05D9\u05EA",
    "gett",
    "\u05D2\u05D8 \u05D8\u05E7\u05E1\u05D9",
    "yango",
    "\u05D9\u05D0\u05E0\u05D2\u05D5",
    "uber",
    // ── Vehicle ──
    "\u05D8\u05E1\u05D8",
    "\u05E8\u05D9\u05E9\u05D5\u05D9",
    "\u05D0\u05D2\u05E8\u05EA \u05E8\u05D9\u05E9\u05D5\u05D9",
    // ── Rental ──
    "\u05D0\u05DC\u05D3\u05DF",
    "\u05E9\u05DC\u05DE\u05D4 \u05E1\u05D9\u05E7\u05E1\u05D8",
    "hertz",
    "avis",
    "budget",
    "\u05D0\u05D5\u05D8\u05D5\u05EA\u05DC",
    "\u05E1\u05D9\u05E7\u05E1\u05D8"
  ],
  categoryKeys: ["transport"]
};
var DINING = {
  key: "dining",
  label: "\u05E4\u05E0\u05D0\u05D9 \u05D5\u05DE\u05E1\u05E2\u05D3\u05D5\u05EA",
  icon: "restaurant",
  bucket: "variable",
  keywords: [
    // ── Restaurants & cafés ──
    "\u05DE\u05E1\u05E2\u05D3\u05D4",
    "\u05E7\u05E4\u05D4",
    "\u05D1\u05D9\u05EA \u05E7\u05E4\u05D4",
    "\u05D0\u05E8\u05D5\u05DE\u05D4",
    "\u05E7\u05D5\u05E4\u05D9",
    "\u05E7\u05E4\u05D4 \u05D4\u05DC\u05DC",
    "\u05E7\u05E4\u05D4 \u05D0\u05D5\u05E8\u05D1\u05DF",
    "\u05E7\u05E4\u05D4 \u05DC\u05E0\u05D3\u05D5\u05D5\u05E8",
    "\u05E7\u05E4\u05D4 \u05E7\u05E4\u05D4",
    "\u05E7\u05E4\u05D4 \u05D2\u05E8\u05D2",
    "\u05D1\u05E8\u05E1\u05D8\u05D4",
    "coffee bean",
    // ── Fast food ──
    "\u05DE\u05E7\u05D3\u05D5\u05E0\u05DC\u05D3\u05E1",
    "mcdonald",
    "\u05D1\u05D5\u05E8\u05D2\u05E8 \u05E7\u05D9\u05E0\u05D2",
    "burger king",
    "\u05D3\u05D5\u05DE\u05D9\u05E0\u05D5\u05E1",
    "\u05E4\u05D9\u05E6\u05D4 \u05D4\u05D0\u05D8",
    "kfc",
    // ── Delivery ──
    "wolt",
    "\u05D5\u05D5\u05DC\u05D8",
    "japanika",
    "\u05D2'\u05E4\u05E0\u05D9\u05E7\u05D4",
    "\u05EA\u05DF \u05D1\u05D9\u05E1",
    "ten bis",
    "cibus",
    "\u05E1\u05D9\u05D1\u05D5\u05E1",
    "\u05DE\u05E9\u05DC\u05D5\u05D7\u05D4",
    // ── Asian / sushi ──
    "\u05E1\u05D5\u05E9\u05D9",
    "\u05E0\u05D2\u05D9\u05E1\u05D4",
    "\u05D0\u05D3\u05D5",
    "\u05E0\u05D5\u05D3\u05D4",
    // ── Bars / entertainment ──
    "\u05E4\u05D0\u05D1",
    "\u05D1\u05E8",
    "\u05DE\u05D9\u05D9\u05E7 \u05E4\u05DC\u05D9\u05D9\u05E1",
    "\u05DE\u05D5\u05DC\u05D9 \u05D1\u05DC\u05D5\u05DD",
    "\u05E1\u05D9\u05E0\u05DE\u05D4",
    "\u05E7\u05D5\u05DC\u05E0\u05D5\u05E2",
    "yes planet",
    "\u05E1\u05D9\u05E0\u05DE\u05D4 \u05E1\u05D9\u05D8\u05D9",
    "\u05D4\u05D5\u05E4\u05E2\u05D4",
    "\u05D4\u05E6\u05D2\u05D4",
    "\u05EA\u05D9\u05D0\u05D8\u05E8\u05D5\u05DF",
    "\u05D4\u05D1\u05D9\u05DE\u05D4",
    "\u05E7\u05D0\u05DE\u05E8\u05D9",
    // ── Fitness ──
    "\u05E1\u05E4\u05D5\u05E8\u05D8",
    "\u05D7\u05D3\u05E8 \u05DB\u05D5\u05E9\u05E8",
    "\u05D4\u05D5\u05DC\u05DE\u05E1",
    "\u05D4\u05D5\u05DC\u05DE\u05E1 \u05E4\u05DC\u05D9\u05D9\u05E1",
    "\u05D2\u05D5 \u05D0\u05E7\u05D8\u05D9\u05D1",
    // ── Parks ──
    "\u05E4\u05D0\u05E8\u05E7",
    "\u05DC\u05D5\u05E0\u05D4 \u05E4\u05D0\u05E8\u05E7",
    "\u05E1\u05E4\u05D0\u05E8\u05D9"
  ],
  categoryKeys: ["leisure"]
};
var DINING_OUT_VAR = {
  key: "dining_out_var",
  label: "\u05D0\u05D5\u05DB\u05DC \u05D1\u05D7\u05D5\u05E5 \u05D5\u05D1\u05D9\u05DC\u05D5\u05D9\u05D9\u05DD",
  icon: "restaurant",
  bucket: "variable",
  keywords: [
    "\u05DE\u05E1\u05E2\u05D3\u05D4",
    "\u05E7\u05E4\u05D4",
    "\u05D1\u05D9\u05EA \u05E7\u05E4\u05D4",
    "\u05D0\u05E8\u05D5\u05DE\u05D4",
    "\u05E7\u05D5\u05E4\u05D9",
    "\u05E7\u05E4\u05D4 \u05D4\u05DC\u05DC",
    "\u05E7\u05E4\u05D4 \u05D0\u05D5\u05E8\u05D1\u05DF",
    "\u05D1\u05E8\u05E1\u05D8\u05D4",
    "\u05E7\u05E4\u05D4 \u05D2\u05E8\u05D2",
    "\u05E7\u05E4\u05D4 \u05DC\u05E0\u05D3\u05D5\u05D5\u05E8",
    "\u05E7\u05E4\u05D4 \u05E7\u05E4\u05D4",
    "coffee bean",
    "\u05DE\u05E7\u05D3\u05D5\u05E0\u05DC\u05D3\u05E1",
    "mcdonald",
    "\u05D1\u05D5\u05E8\u05D2\u05E8 \u05E7\u05D9\u05E0\u05D2",
    "burger king",
    "\u05D3\u05D5\u05DE\u05D9\u05E0\u05D5\u05E1",
    "\u05E4\u05D9\u05E6\u05D4 \u05D4\u05D0\u05D8",
    "kfc",
    "wolt",
    "\u05D5\u05D5\u05DC\u05D8",
    "japanika",
    "\u05D2'\u05E4\u05E0\u05D9\u05E7\u05D4",
    "ten bis",
    "\u05EA\u05DF \u05D1\u05D9\u05E1",
    "cibus",
    "\u05E1\u05D9\u05D1\u05D5\u05E1",
    "\u05DE\u05E9\u05DC\u05D5\u05D7\u05D4",
    "\u05E1\u05D5\u05E9\u05D9",
    "\u05E0\u05D2\u05D9\u05E1\u05D4",
    "\u05D0\u05D3\u05D5",
    "\u05E0\u05D5\u05D3\u05D4",
    "\u05E4\u05D0\u05D1",
    "\u05D1\u05E8",
    "\u05DE\u05D9\u05D9\u05E7 \u05E4\u05DC\u05D9\u05D9\u05E1",
    "\u05DE\u05D5\u05DC\u05D9 \u05D1\u05DC\u05D5\u05DD",
    "\u05E1\u05D9\u05E0\u05DE\u05D4",
    "\u05E7\u05D5\u05DC\u05E0\u05D5\u05E2",
    "yes planet",
    "\u05E1\u05D9\u05E0\u05DE\u05D4 \u05E1\u05D9\u05D8\u05D9",
    "\u05D4\u05D5\u05E4\u05E2\u05D4",
    "\u05D4\u05E6\u05D2\u05D4",
    "\u05EA\u05D9\u05D0\u05D8\u05E8\u05D5\u05DF",
    "\u05D4\u05D1\u05D9\u05DE\u05D4",
    "\u05E7\u05D0\u05DE\u05E8\u05D9"
  ],
  categoryKeys: ["dining_out"]
};
var SHOPPING_VAR = {
  key: "shopping_var",
  label: "\u05E7\u05E0\u05D9\u05D5\u05EA \u05D5\u05D1\u05D9\u05D2\u05D5\u05D3",
  icon: "storefront",
  bucket: "variable",
  keywords: [
    // ── Home ──
    "\u05D0\u05D9\u05E7\u05D0\u05D4",
    "\u05D4\u05D5\u05DD \u05E1\u05E0\u05D8\u05E8",
    "ace",
    "\u05D4\u05D5\u05DD \u05D3\u05D9\u05E4\u05D5",
    "\u05DB\u05D9\u05EA\u05DF",
    "\u05DE\u05D9\u05DC\u05D2\u05DD",
    // ── Fashion ──
    "\u05D6\u05D0\u05E8\u05D4",
    "h&m",
    "fox",
    "\u05D2\u05D5\u05DC\u05E3",
    "\u05E7\u05E1\u05D8\u05E8\u05D5",
    "\u05D0\u05DE\u05E8\u05D9\u05E7\u05DF \u05D0\u05D9\u05D2\u05DC",
    "\u05DE\u05E0\u05D2\u05D5",
    "\u05D8\u05E8\u05DE\u05D9\u05E0\u05DC x",
    "\u05E4\u05D5\u05DC\u05D5",
    "pull&bear",
    "bershka",
    "\u05E2\u05D3\u05D9\u05E7\u05D4",
    "\u05D4\u05D5\u05D3\u05D9\u05E1",
    "\u05E0\u05E2\u05DC\u05D9",
    "\u05D1\u05D9\u05D2\u05D5\u05D3",
    // ── Online ──
    "\u05D0\u05DC\u05D9\u05D0\u05E7\u05E1\u05E4\u05E8\u05E1",
    "aliexpress",
    "amazon",
    "shein",
    "\u05E9\u05D9\u05D9\u05DF",
    "ebay",
    "iherb",
    "asos",
    // ── Department / general ──
    "\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8 \u05DC\u05E6\u05E8\u05DB\u05DF",
    "\u05D4\u05DE\u05E9\u05D1\u05D9\u05E8",
    "\u05E7\u05E0\u05D9\u05D5\u05DF",
    // ── Electronics ──
    "\u05D1\u05D0\u05D2",
    "bug",
    "\u05D0\u05D9\u05D9\u05D1\u05D5\u05E8\u05D9",
    "ivory",
    "ksp",
    // ── Books / toys ──
    "\u05E9\u05D8\u05D9\u05D9\u05DE\u05E6\u05E7\u05D9",
    "steimatzky",
    "\u05E6\u05E2\u05E6\u05D5\u05E2\u05D9\u05DD",
    "\u05DC\u05D2\u05D5",
    // ── Beauty ──
    "\u05E1\u05D3\u05E8\u05D4",
    "sabon",
    "\u05E1\u05D1\u05D5\u05DF",
    "\u05DC\u05D0\u05D5\u05E7\u05E1\u05D9\u05D8\u05DF",
    "kiko",
    "\u05DE\u05D0\u05E7",
    // ── Sport goods ──
    "\u05D3\u05E7\u05D8\u05DC\u05D5\u05DF",
    "decathlon",
    "\u05D0\u05D9\u05E0\u05D8\u05E8\u05E1\u05E4\u05D5\u05E8\u05D8"
  ],
  categoryKeys: ["shopping"]
};
var HEALTH_VAR = {
  key: "health_var",
  label: "\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA \u05DE\u05E9\u05EA\u05E0\u05D4",
  icon: "local_hospital",
  bucket: "variable",
  keywords: [
    "\u05DE\u05DB\u05D1\u05D9",
    "\u05DB\u05DC\u05DC\u05D9\u05EA",
    "\u05DE\u05D0\u05D5\u05D7\u05D3\u05EA",
    "\u05DC\u05D0\u05D5\u05DE\u05D9\u05EA",
    "\u05D1\u05D9\u05EA \u05DE\u05E8\u05E7\u05D7\u05EA",
    "\u05E8\u05E4\u05D5\u05D0\u05D4",
    "\u05E8\u05D5\u05E4\u05D0",
    "\u05D1\u05D9\u05EA \u05D7\u05D5\u05DC\u05D9\u05DD",
    "\u05DE\u05E8\u05E4\u05D0\u05D4",
    "\u05E9\u05D9\u05E0\u05D9\u05D9\u05DD",
    "\u05D0\u05D5\u05E4\u05D8\u05D9\u05E7\u05D4",
    "\u05E2\u05D9\u05E0\u05D9\u05D9\u05DD",
    "\u05D8\u05D9\u05E4\u05D5\u05DC",
    "\u05EA\u05E8\u05D5\u05E4\u05D5\u05EA",
    "\u05E4\u05D9\u05D6\u05D9\u05D5\u05EA\u05E8\u05E4\u05D9\u05D4",
    "\u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2",
    "\u05D3\u05D9\u05D0\u05D8\u05E0\u05D9\u05EA",
    "\u05E7\u05DC\u05D9\u05E0\u05D0\u05D9\u05EA",
    "\u05D0\u05D9\u05DB\u05D9\u05DC\u05D5\u05D1",
    "\u05E9\u05D9\u05D1\u05D0",
    "\u05D4\u05D3\u05E1\u05D4",
    "\u05E1\u05D5\u05E8\u05D5\u05E7\u05D4",
    "\u05D0\u05E1\u05E3 \u05D4\u05E8\u05D5\u05E4\u05D0",
    '\u05E8\u05DE\u05D1"\u05DD',
    "\u05D5\u05D5\u05DC\u05E4\u05E1\u05D5\u05DF",
    "\u05D1\u05DC\u05D9\u05E0\u05E1\u05D5\u05DF",
    "\u05E9\u05E0\u05D9\u05D9\u05D3\u05E8",
    "\u05DE\u05D0\u05D9\u05E8",
    // סופר-פארם belongs to health, not grocery
    "\u05E1\u05D5\u05E4\u05E8-\u05E4\u05D0\u05E8\u05DD",
    "\u05E1\u05D5\u05E4\u05E8 \u05E4\u05D0\u05E8\u05DD",
    "super pharm",
    "\u05E4\u05D0\u05E8\u05DD",
    "good pharm"
  ],
  categoryKeys: ["health"]
};
var CASH_VAR = {
  key: "cash_var",
  label: "\u05DE\u05D6\u05D5\u05DE\u05DF",
  icon: "local_atm",
  bucket: "variable",
  keywords: ["\u05DE\u05E9\u05D9\u05DB\u05EA \u05DE\u05D6\u05D5\u05DE\u05DF", "\u05DB\u05E1\u05E4\u05D5\u05DE\u05D8", "atm", "\u05DE\u05E9\u05D9\u05DB\u05D4"],
  categoryKeys: ["cash"]
};
var REFUNDS_VAR = {
  key: "refunds_var",
  label: "\u05D6\u05D9\u05DB\u05D5\u05D9\u05D9\u05DD",
  icon: "currency_exchange",
  bucket: "variable",
  keywords: ["\u05D6\u05D9\u05DB\u05D5\u05D9", "\u05D4\u05D7\u05D6\u05E8", "refund", "\u05D1\u05D9\u05D8\u05D5\u05DC \u05E2\u05E1\u05E7\u05D4", "\u05D4\u05D7\u05D6\u05E8 \u05DB\u05E1\u05E4\u05D9"],
  categoryKeys: ["refunds"]
};
var SUB_CATEGORIES = [
  // Fixed
  HOUSING,
  HOME_BILLS,
  TELECOM,
  INSURANCE,
  EDU_FIXED,
  PENSION_FIXED,
  FEES_FIXED,
  // Variable
  GROCERY,
  TRANSPORT_VAR,
  DINING,
  DINING_OUT_VAR,
  SHOPPING_VAR,
  HEALTH_VAR,
  CASH_VAR,
  REFUNDS_VAR
];
var SUB_CATEGORIES_BY_BUCKET = {};
for (const sc of SUB_CATEGORIES) {
  if (!SUB_CATEGORIES_BY_BUCKET[sc.bucket]) SUB_CATEGORIES_BY_BUCKET[sc.bucket] = [];
  SUB_CATEGORIES_BY_BUCKET[sc.bucket].push(sc);
}

// ../lib/doc-parser/index.ts
async function parseDocument(buffer, filename) {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "xlsx":
    case "xls":
    case "csv":
      return parseExcel(buffer, filename);
    case "pdf":
      return await parsePDF(buffer, filename);
    default:
      return {
        filename,
        type: "pdf",
        bankHint: "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4",
        transactions: [],
        totalDebit: 0,
        totalCredit: 0,
        dateRange: { from: "", to: "" },
        warnings: [`\u05E1\u05D5\u05D2 \u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05E0\u05EA\u05DE\u05DA: .${ext}. \u05D4\u05E2\u05DC\u05D4 PDF \u05D0\u05D5 Excel.`]
      };
  }
}

// ../lib/doc-parser/merchant-category-rules.server.ts
init_server_only();

// ../lib/doc-parser/merchant-category-rules-core.ts
function normalizeInput(value) {
  return String(value || "").replace(/["\u200F\u200E]/g, "").replace(/\s+/g, " ").trim();
}
function computeMerchantCategoryRulesFromVotes(votes) {
  const grouped = /* @__PURE__ */ new Map();
  for (const vote of votes) {
    const merchantKey = normalizeInput(vote.merchantKey).toLowerCase();
    const categoryKey = normalizeInput(vote.categoryKey).toLowerCase();
    const txCount = Number(vote.txCount) || 0;
    const createdAt = vote.createdAt || (/* @__PURE__ */ new Date(0)).toISOString();
    if (!merchantKey || !categoryKey || txCount <= 0) continue;
    let merchantMap = grouped.get(merchantKey);
    if (!merchantMap) {
      merchantMap = /* @__PURE__ */ new Map();
      grouped.set(merchantKey, merchantMap);
    }
    const existing = merchantMap.get(categoryKey);
    if (existing) {
      existing.count += txCount;
      if (createdAt < existing.firstSeenAt) existing.firstSeenAt = createdAt;
      if (createdAt > existing.updatedAt) existing.updatedAt = createdAt;
      if (!existing.sampleDescription && vote.sampleDescription) {
        existing.sampleDescription = vote.sampleDescription;
      }
      continue;
    }
    merchantMap.set(categoryKey, {
      merchantKey,
      categoryKey,
      count: txCount,
      firstSeenAt: createdAt,
      updatedAt: createdAt,
      sampleDescription: vote.sampleDescription
    });
  }
  const out = [];
  for (const [merchantKey, merchantMap] of grouped.entries()) {
    const categories = [...merchantMap.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt.localeCompare(b.firstSeenAt);
      return a.categoryKey.localeCompare(b.categoryKey);
    });
    const winner = categories[0];
    if (winner) {
      out.push({
        ...winner,
        merchantKey
      });
    }
  }
  return out.sort((a, b) => a.merchantKey.localeCompare(b.merchantKey, "he"));
}

// ../lib/doc-parser/merchant-category-rules.server.ts
init_merchant_category_rules();
function mapRuleRow(row) {
  return {
    merchantKey: row.merchant_key,
    categoryKey: row.category_key,
    count: Number(row.count) || 0,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    sampleDescription: row.sample_description || void 0
  };
}
function mapVoteRow(row) {
  return {
    merchantKey: row.merchant_key,
    categoryKey: row.category_key,
    txCount: Number(row.tx_count) || 0,
    createdAt: row.created_at,
    sampleDescription: row.sample_description || void 0
  };
}
async function loadMerchantCategoryRulesFromDb(sb) {
  try {
    const { data: data2, error: error2 } = await sb.from("v_merchant_category_rules").select("merchant_key, category_key, count, first_seen_at, updated_at, sample_description").order("merchant_key", { ascending: true });
    if (!error2 && Array.isArray(data2)) {
      return data2.map(mapRuleRow);
    }
  } catch (error2) {
    console.warn("[merchant-category-rules] view load failed, falling back to raw votes:", error2);
  }
  const { data, error } = await sb.from("merchant_category_votes").select("merchant_key, category_key, tx_count, created_at, sample_description").order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) {
    if (error) {
      console.warn("[merchant-category-rules] raw vote load failed:", error.message);
    }
    return [];
  }
  return computeMerchantCategoryRulesFromVotes(
    data.map(mapVoteRow)
  ).map((row) => ({
    merchantKey: row.merchantKey,
    categoryKey: row.categoryKey,
    count: row.count,
    firstSeenAt: row.firstSeenAt,
    updatedAt: row.updatedAt,
    sampleDescription: row.sampleDescription
  }));
}
async function primeMerchantCategoryRulesCacheFromDb(sb) {
  const rules = await loadMerchantCategoryRulesFromDb(sb);
  setMerchantCategoryRulesCache(rules);
  return rules;
}
async function insertMerchantCategoryVotes(sb, userId, votes) {
  const rows = votes.map((vote) => ({
    created_by: userId,
    merchant_key: vote.merchantKey,
    category_key: vote.categoryKey,
    tx_count: Math.max(1, Math.floor(Number(vote.txCount) || 1)),
    sample_description: vote.sampleDescription || null,
    source_file: vote.sourceFile || null
  })).filter((row) => row.merchant_key && row.category_key);
  if (rows.length === 0) {
    return { inserted: 0 };
  }
  const { error } = await sb.from("merchant_category_votes").insert(rows);
  if (error) {
    throw new Error(error.message);
  }
  return { inserted: rows.length };
}
async function deleteMerchantCategoryVotes(sb, merchantKeys) {
  if (merchantKeys.length === 0) return { deleted: true };
  const { error } = await sb.from("merchant_category_votes").delete().in("merchant_key", merchantKeys);
  if (error) {
    throw new Error(error.message);
  }
  return { deleted: true };
}

// src/lib/upload.ts
import multer from "multer";
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// src/lib/rate-limit.ts
var buckets = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 6e4).unref?.();
function rateLimit(opts) {
  const now = Date.now();
  const bucket = buckets.get(opts.key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }
  if (bucket.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: opts.limit - bucket.count, resetAt: bucket.resetAt };
}
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff?.split(",")[0];
  return first?.trim() || req.headers["x-real-ip"] || req.headers["cf-connecting-ip"] || req.ip || "unknown";
}
var RATE_LIMITS = {
  UPLOAD: { limit: 10, windowMs: 6e4 },
  PARSE: { limit: 20, windowMs: 6e4 },
  AUTH: { limit: 5, windowMs: 6e4 },
  INVITE: { limit: 10, windowMs: 60 * 6e4 },
  GENERIC: { limit: 60, windowMs: 6e4 }
};

// src/routes/documents.ts
var documentsRouter = Router7();
var ALLOWED_EXTS = ["pdf", "xlsx", "xls", "csv"];
var MAX_SIZE = 10 * 1024 * 1024;
var PDF_MAGIC = Buffer.from([37, 80, 68, 70]);
documentsRouter.post(
  "/parse",
  requireUser,
  upload.any(),
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    await primeMerchantCategoryRulesCacheFromDb(sb).catch((error) => {
      console.warn("[documents/parse] merchant-category cache prime failed:", error);
    });
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `parse:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1e3)));
      res.status(429).json({ error: "\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05D1\u05E7\u05E9\u05D5\u05EA. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4." });
      return;
    }
    const files = (req.files || []).filter((f) => f.size > 0);
    if (files.length === 0) {
      res.status(400).json({ error: "\u05DC\u05D0 \u05E6\u05D5\u05E8\u05E4\u05D5 \u05E7\u05D1\u05E6\u05D9\u05DD" });
      return;
    }
    for (const file of files) {
      const ext = file.originalname.toLowerCase().split(".").pop();
      if (!ALLOWED_EXTS.includes(ext || "")) {
        res.status(400).json({ error: `\u05E1\u05D5\u05D2 \u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05E0\u05EA\u05DE\u05DA: ${file.originalname}. \u05D4\u05E2\u05DC\u05D4 PDF \u05D0\u05D5 Excel.` });
        return;
      }
      if (file.size > MAX_SIZE) {
        res.status(400).json({ error: `\u05D4\u05E7\u05D5\u05D1\u05E5 ${file.originalname} \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9 (\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD 10MB)` });
        return;
      }
    }
    for (const file of files) {
      const ext = file.originalname.toLowerCase().split(".").pop();
      const header = file.buffer.subarray(0, 8);
      if (ext === "pdf") {
        if (header.length < 4 || !header.subarray(0, 4).equals(PDF_MAGIC)) {
          res.status(400).json({ error: `\u05D4\u05E7\u05D5\u05D1\u05E5 ${file.originalname} \u05D0\u05D9\u05E0\u05D5 PDF \u05EA\u05E7\u05D9\u05DF \u2014 \u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8`, code: "INVALID_PDF" });
          return;
        }
      } else if (ext === "xlsx") {
        if (header.length < 4 || header[0] !== 80 || header[1] !== 75) {
          res.status(400).json({ error: `\u05D4\u05E7\u05D5\u05D1\u05E5 ${file.originalname} \u05D0\u05D9\u05E0\u05D5 Excel \u05EA\u05E7\u05D9\u05DF (.xlsx)`, code: "INVALID_XLSX" });
          return;
        }
      } else if (ext === "xls") {
        if (header.length < 4 || header[0] !== 208 || header[1] !== 207 || header[2] !== 17 || header[3] !== 224) {
          res.status(400).json({ error: `\u05D4\u05E7\u05D5\u05D1\u05E5 ${file.originalname} \u05D0\u05D9\u05E0\u05D5 Excel \u05EA\u05E7\u05D9\u05DF (.xls)`, code: "INVALID_XLS" });
          return;
        }
      }
    }
    const parsedDocs = [];
    for (const file of files) {
      let result;
      try {
        result = await parseDocument(file.buffer, file.originalname);
      } catch {
        res.status(422).json({
          error: `\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 ${file.originalname} \u2014 \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05D5\u05D0 \u05E4\u05D2\u05D5\u05DD \u05D0\u05D5 \u05DE\u05D5\u05E6\u05E4\u05DF`,
          code: "CORRUPT_FILE"
        });
        return;
      }
      parsedDocs.push(result);
    }
    if (parsedDocs.length === 1) {
      res.json(parsedDocs[0]);
      return;
    }
    const txArrays = parsedDocs.map((d) => ({ transactions: d.transactions, sourceFile: d.filename }));
    const { merged, duplicatesRemoved, sourceFiles } = deduplicateTransactions(txArrays);
    const allWarnings = parsedDocs.flatMap((d) => d.warnings.map((w) => `[${d.filename}] ${w}`));
    if (duplicatesRemoved > 0) {
      allWarnings.push(`\u05D6\u05D5\u05D4\u05D5 ${duplicatesRemoved} \u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05DB\u05E4\u05D5\u05DC\u05D5\u05EA \u05D1\u05D9\u05DF \u05D4\u05E7\u05D1\u05E6\u05D9\u05DD \u2014 \u05D4\u05D5\u05E1\u05E8\u05D5 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA`);
    }
    const bankHints = [...new Set(parsedDocs.map((d) => d.bankHint).filter((h) => h !== "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4"))];
    const bankHint = bankHints.length > 0 ? bankHints.join(" + ") : "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4";
    const seenInst = /* @__PURE__ */ new Set();
    const allInstruments = [];
    for (const doc of parsedDocs) {
      for (const inst of doc.instruments || []) {
        const key = `${inst.type}::${inst.institution}::${inst.identifier}`;
        if (!seenInst.has(key)) {
          seenInst.add(key);
          allInstruments.push(inst);
        }
      }
    }
    const totalDebit = merged.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalCredit = merged.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = merged.map((t) => t.date).filter(Boolean).sort();
    res.json({
      filename: sourceFiles.join(" + "),
      type: parsedDocs[0].type,
      bankHint,
      transactions: merged,
      totalDebit,
      totalCredit,
      dateRange: { from: dates[0] || "", to: dates[dates.length - 1] || "" },
      warnings: allWarnings,
      instruments: allInstruments,
      sourceFiles,
      duplicatesRemoved
    });
  })
);

// src/routes/debt.ts
import { Router as Router8 } from "express";

// ../lib/doc-parser/amortization-pdf-parser.ts
function classifyIndexation(text) {
  const t = text.toLowerCase();
  if (/מדד|צמוד|index/.test(text)) {
    if (/לא\s*צמוד/.test(text)) return "\u05DC\u05D0 \u05E6\u05DE\u05D5\u05D3";
    return "\u05DE\u05D3\u05D3";
  }
  if (/דולר|usd|dollar/.test(t)) return "\u05D3\u05D5\u05DC\u05E8";
  if (/לא\s*צמוד|unindex/.test(text)) return "\u05DC\u05D0 \u05E6\u05DE\u05D5\u05D3";
  return "\u05DC\u05D0 \u05E6\u05DE\u05D5\u05D3";
}
function classifyRepayment(text) {
  if (/שפיצר|spitzer/i.test(text)) return "\u05E9\u05E4\u05D9\u05E6\u05E8";
  if (/קרן\s*שווה|equal/i.test(text)) return "\u05E7\u05E8\u05DF \u05E9\u05D5\u05D5\u05D4";
  if (/בלון|בולט|bullet|balloon/i.test(text)) return "\u05D1\u05DC\u05D5\u05DF";
  return "\u05E9\u05E4\u05D9\u05E6\u05E8";
}
function classifyTrackName(text) {
  if (/פריים|prime/i.test(text)) return { name: "\u05E4\u05E8\u05D9\u05D9\u05DD", isPrime: true };
  if (/קל[״"']?צ|לא\s*צמוד\s*קבוע/i.test(text)) return { name: '\u05E7\u05DC"\u05E6', isPrime: false };
  if (/ק[״"']?צ|צמוד\s*קבוע/i.test(text)) return { name: '\u05E7"\u05E6', isPrime: false };
  if (/משק[״"']?ל|משתנה\s*צמוד/i.test(text)) return { name: '\u05DE\u05E9\u05E7"\u05DC', isPrime: false };
  if (/משתנה|variable/i.test(text)) return { name: "\u05DE\u05E9\u05EA\u05E0\u05D4", isPrime: false };
  if (/צמוד|index/.test(text)) return { name: "\u05E6\u05DE\u05D5\u05D3", isPrime: false };
  return { name: "\u05DE\u05E1\u05DC\u05D5\u05DC", isPrime: false };
}
function detectBank2(text) {
  const head = text.slice(0, 1500);
  if (/הפועלים|hapoalim|בנק פועלים/i.test(head)) return "\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD";
  if (/לאומי|leumi/i.test(head)) return "\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9";
  if (/דיסקונט|discount/i.test(head)) return "\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8";
  if (/מזרחי|mizrahi|טפחות/i.test(head)) return "\u05D1\u05E0\u05E7 \u05DE\u05D6\u05E8\u05D7\u05D9-\u05D8\u05E4\u05D7\u05D5\u05EA";
  if (/בינלאומי|fibi/i.test(head)) return "\u05D4\u05D1\u05D9\u05E0\u05DC\u05D0\u05D5\u05DE\u05D9";
  if (/אוצר\s*החייל|otzar/i.test(head)) return "\u05D0\u05D5\u05E6\u05E8 \u05D4\u05D7\u05D9\u05D9\u05DC";
  if (/ירושלים|jerusalem/i.test(head)) return "\u05D1\u05E0\u05E7 \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD";
  return "";
}
function extractNumbers2(line) {
  const out = [];
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const n = parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
function findRate(line, numbers) {
  const percentIdx = line.indexOf("%");
  if (percentIdx >= 0) {
    const reBefore = /(-?\d+(?:\.\d+)?)\s*%/g;
    let m;
    while ((m = reBefore.exec(line)) !== null) {
      const val = parseFloat(m[1]);
      if (val >= 0 && val < 20) {
        const idx = numbers.indexOf(val);
        return { rate: val / 100, index: idx >= 0 ? idx : 0 };
      }
    }
  }
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (n > 0 && n < 12 && !Number.isInteger(n) && n.toString().includes(".")) {
      return { rate: n / 100, index: i };
    }
  }
  return null;
}
function findYearMonth(line) {
  const yyMatch = line.match(/\b(20\d{2}|19\d{2})\b/);
  const mmYY = line.match(/\b(\d{1,2})[/.\-](20\d{2})\b/);
  if (mmYY) {
    const mm = String(parseInt(mmYY[1], 10)).padStart(2, "0");
    return `${mmYY[2]}-${mm}`;
  }
  const dmy = line.match(/\b\d{1,2}[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if (dmy) {
    const mm = String(parseInt(dmy[1], 10)).padStart(2, "0");
    return `${dmy[2]}-${mm}`;
  }
  if (yyMatch) return `${yyMatch[1]}-01`;
  return "";
}
function parseAmortizationText(text) {
  const warnings = [];
  const bankHint = detectBank2(text);
  if (!bankHint) warnings.push("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4 \u05E9\u05DD \u05D4\u05D1\u05E0\u05E7 \u2014 \u05D5\u05D3\u05D0\u05D5 \u05D9\u05D3\u05E0\u05D9\u05EA \u05E9\u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05E9\u05D9\u05D9\u05DB\u05D9\u05DD \u05DC\u05D0\u05D5\u05EA\u05D4 \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0.");
  const totals = {};
  const sumLine = text.match(/יתרת\s*קרן\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (sumLine) {
    const v = parseFloat(sumLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.remainingBalance = v;
  }
  const monthlyLine = text.match(/החזר\s*חודשי\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (monthlyLine) {
    const v = parseFloat(monthlyLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.monthlyPayment = v;
  }
  const origLine = text.match(/קרן\s*מקורית\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/);
  if (origLine) {
    const v = parseFloat(origLine[1].replace(/,/g, ""));
    if (Number.isFinite(v)) totals.originalAmount = v;
  }
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 10);
  const trackLines = lines.filter((line) => {
    const hasTrackKeyword = /פריים|prime|קל[״"']?צ|ק[״"']?צ|משק[״"']?ל|משתנה|צמוד|index/i.test(line);
    const numbers = extractNumbers2(line);
    const hasRate = line.includes("%") || numbers.some((n) => n > 0 && n < 12 && !Number.isInteger(n) && n.toString().includes("."));
    return hasTrackKeyword && numbers.length >= 2 && hasRate;
  });
  const tracks = [];
  for (const line of trackLines) {
    const numbers = extractNumbers2(line);
    const rateInfo = findRate(line, numbers);
    if (!rateInfo) continue;
    const { rate, index: rateIdx } = rateInfo;
    const moneyNumbers = numbers.filter((_, i) => i !== rateIdx).filter((n) => n > 100);
    moneyNumbers.sort((a, b) => b - a);
    const trackInfo = classifyTrackName(line);
    const indexation = classifyIndexation(line);
    const repaymentMethod = classifyRepayment(line);
    const monthlyPayment = moneyNumbers[moneyNumbers.length - 1] || 0;
    const remainingBalance = moneyNumbers[0] || 0;
    const originalAmount = moneyNumbers[1] || remainingBalance;
    const endDate = findYearMonth(line);
    let confidence = 0.5;
    if (moneyNumbers.length >= 2) confidence += 0.2;
    if (endDate) confidence += 0.15;
    if (trackInfo.name !== "\u05DE\u05E1\u05DC\u05D5\u05DC") confidence += 0.15;
    confidence = Math.min(1, confidence);
    tracks.push({
      name: trackInfo.name,
      indexation,
      repaymentMethod,
      interestRate: rate,
      margin: trackInfo.isPrime ? rate : void 0,
      originalAmount,
      remainingBalance,
      monthlyPayment,
      startDate: "",
      endDate,
      totalPayments: 0,
      confidence,
      sourceLine: line
    });
  }
  if (tracks.length === 0) {
    warnings.push("\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9 \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0 \u05D1\u05E7\u05D5\u05D1\u05E5. \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05DE\u05D3\u05D5\u05D1\u05E8 \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 \u05E1\u05E8\u05D5\u05E7/\u05DC\u05D0-\u05D8\u05E7\u05E1\u05D8\u05D5\u05D0\u05DC\u05D9.");
  }
  if (totals.remainingBalance && tracks.length > 0) {
    const sum = tracks.reduce((s, t) => s + t.remainingBalance, 0);
    const drift = Math.abs(sum - totals.remainingBalance) / totals.remainingBalance;
    if (drift > 0.05) {
      warnings.push(
        `\u05E1\u05DB\u05D5\u05DD \u05D9\u05EA\u05E8\u05D5\u05EA \u05E9\u05D6\u05D5\u05D4\u05D5 (\u20AA${Math.round(sum).toLocaleString("he-IL")}) \u05E9\u05D5\u05E0\u05D4 \u05DE\u05D4\u05D9\u05EA\u05E8\u05D4 \u05D4\u05DB\u05D5\u05DC\u05DC\u05EA \u05D1\u05E7\u05D5\u05D1\u05E5 (\u20AA${Math.round(totals.remainingBalance).toLocaleString("he-IL")}). \u05D1\u05D3\u05E7\u05D5 \u05DC\u05E4\u05E0\u05D9 \u05E9\u05DE\u05D9\u05E8\u05D4.`
      );
    }
  }
  return { bankHint, tracks, totals, warnings };
}

// src/routes/debt.ts
var debtRouter = Router8();
var MAX_FILE_BYTES = 20 * 1024 * 1024;
var PDF_MAGIC2 = Buffer.from([37, 80, 68, 70]);
var PDF_PAGE_CAP = 30;
function sanitizeFilename(raw) {
  const cleaned = raw.replace(/[^\w֐-׿\s\-_.()]/g, "").slice(0, 120).trim();
  return cleaned || "amortization.pdf";
}
debtRouter.post(
  "/parse-amortization",
  requireUser,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const errJson = (message, code, status) => res.status(status).json({ error: message, code });
    const rl = rateLimit({ key: `amort-parse:${req.user.id}`, ...RATE_LIMITS.UPLOAD });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1e3))));
      res.status(429).json({ error: "\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05D1\u05E7\u05E9\u05D5\u05EA. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4.", code: "RATE_LIMITED" });
      return;
    }
    const file = req.file;
    if (!file) return errJson("\u05DC\u05D0 \u05D4\u05D5\u05E2\u05DC\u05D4 \u05E7\u05D5\u05D1\u05E5. \u05E6\u05E8\u05E3 \u05DC\u05D5\u05D7 \u05E1\u05D9\u05DC\u05D5\u05E7\u05D9\u05DF \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 PDF.", "NO_FILE", 400);
    const name = file.originalname || "amortization.pdf";
    if (file.size > MAX_FILE_BYTES) return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9, \u05E2\u05D3 20MB", "FILE_TOO_LARGE", 413);
    if (!/\.pdf$/i.test(name)) return errJson(`\u05D4\u05E7\u05D5\u05D1\u05E5 ${name} \u05D0\u05D9\u05E0\u05D5 PDF \u2014 \u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05E1\u05D5\u05D2 \u05D4\u05E7\u05D5\u05D1\u05E5`, "INVALID_EXTENSION", 400);
    const buffer = file.buffer;
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC2)) {
      return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D0\u05D9\u05E0\u05D5 PDF \u05EA\u05E7\u05D9\u05DF \u2014 \u05D1\u05D3\u05D5\u05E7 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05E8", "INVALID_PDF", 400);
    }
    const pdfParse4 = (await import("pdf-parse")).default;
    let text;
    try {
      const result = await pdfParse4(buffer, { max: PDF_PAGE_CAP });
      text = result.text || "";
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-amortization] pdf-parse failed:", reason);
      if (/password|encrypt/i.test(reason)) {
        return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DE\u05D5\u05D2\u05DF \u05D1\u05E1\u05D9\u05E1\u05DE\u05D4 \u2014 \u05D4\u05E1\u05E8 \u05D0\u05EA \u05D4\u05D4\u05D2\u05E0\u05D4 \u05D5\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1", "ENCRYPTED_PDF", 422);
      }
      return errJson(`\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }
    if (!text || text.trim().length < 50) {
      return errJson(
        "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D8\u05E7\u05E1\u05D8 \u05E7\u05E8\u05D9\u05D0 \u05D1-PDF \u2014 \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05E7\u05D5\u05D1\u05E5 \u05E1\u05E8\u05D5\u05E7. \u05E0\u05E1\u05D5 \u05DC\u05D9\u05D9\u05E6\u05D0 PDF \u05D8\u05E7\u05E1\u05D8\u05D5\u05D0\u05DC\u05D9 \u05DE\u05D4\u05D0\u05EA\u05E8 \u05E9\u05DC \u05D4\u05D1\u05E0\u05E7.",
        "TEXT_LAYER_EMPTY",
        422
      );
    }
    const parsed = parseAmortizationText(text);
    res.json({ filename: sanitizeFilename(name), ...parsed });
  })
);

// src/routes/categorize.ts
import { Router as Router9 } from "express";
import { z as z5 } from "zod";

// ../lib/doc-parser/ai-categorizer.ts
init_server_only();
init_anthropic_client();

// ../lib/perplexity-client.ts
init_server_only();
function getPerplexityKey() {
  return process.env.PERPLEXITY_API_KEY;
}
async function createPerplexityCompletion(messages, model = "sonar-pro") {
  const apiKey2 = getPerplexityKey();
  if (!apiKey2) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey2}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
      temperature: 0.1
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Perplexity API error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  return res.json();
}

// ../lib/doc-parser/ai-categorizer.ts
init_categorizer();

// ../lib/doc-parser/category-tree.ts
var PARENT_CATEGORIES = [
  { key: "p_housing", label: "\u05D3\u05D9\u05D5\u05E8 \u05D5\u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05D1\u05D9\u05EA", icon: "home", color: "#1B4332", order: 1 },
  { key: "p_food", label: "\u05DE\u05D6\u05D5\u05DF \u05D5\u05D0\u05D5\u05DB\u05DC", icon: "restaurant", color: "#059669", order: 2 },
  { key: "p_transport", label: "\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05D5\u05E8\u05DB\u05D1", icon: "directions_car", color: "#3b82f6", order: 3 },
  { key: "p_health", label: "\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA", icon: "local_hospital", color: "#ef4444", order: 4 },
  { key: "p_kids", label: "\u05D9\u05DC\u05D3\u05D9\u05DD \u05D5\u05D7\u05D9\u05E0\u05D5\u05DA", icon: "school", color: "#0E7490", order: 5 },
  { key: "p_lifestyle", label: "\u05E4\u05E0\u05D0\u05D9 \u05D5\u05E7\u05E0\u05D9\u05D5\u05EA", icon: "shopping_bag", color: "#ec4899", order: 6 },
  { key: "p_insurance", label: "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D5\u05E4\u05E0\u05E1\u05D9\u05D4", icon: "shield", color: "#06b6d4", order: 7 },
  { key: "p_financial", label: "\u05E4\u05D9\u05E0\u05E0\u05E1\u05D9 \u05D5\u05DB\u05E1\u05E4\u05D9\u05DD", icon: "account_balance", color: "#64748b", order: 8 },
  { key: "p_business", label: "\u05E2\u05E1\u05E7\u05D9", icon: "business_center", color: "#7C3AED", order: 9 },
  { key: "p_misc", label: "\u05E9\u05D5\u05E0\u05D5\u05EA", icon: "category", color: "#9ca3af", order: 10 }
];
var LEAF_TO_PARENT = {
  // Housing & home bills
  housing: "p_housing",
  utilities: "p_housing",
  home_maintenance: "p_housing",
  // Food
  food: "p_food",
  dining_out: "p_food",
  // Transport
  transport: "p_transport",
  // Health
  health: "p_health",
  // Kids & education
  education: "p_kids",
  // Lifestyle / shopping
  leisure: "p_lifestyle",
  shopping: "p_lifestyle",
  subscriptions: "p_lifestyle",
  // Insurance + pension
  insurance: "p_insurance",
  pension: "p_insurance",
  // Financial / money movement
  transfers: "p_financial",
  cash: "p_financial",
  fees: "p_financial",
  refunds: "p_financial",
  salary: "p_financial",
  // Self-employed business
  advertising_marketing: "p_business",
  professional_services: "p_business",
  business_taxes: "p_business",
  business_payments: "p_business",
  // Catch-all
  misc: "p_misc",
  other: "p_misc"
};
function getParentKey(leafKey) {
  return LEAF_TO_PARENT[leafKey] || "p_misc";
}
function groupOptionsByParent(flatOptions) {
  const sortedParents = [...PARENT_CATEGORIES].sort((a, b) => a.order - b.order);
  return sortedParents.map((parent) => ({
    parent,
    options: flatOptions.filter((o) => getParentKey(o.key) === parent.key)
  })).filter((g) => g.options.length > 0);
}

// ../lib/doc-parser/ai-categorizer.ts
var MODEL2 = "claude-haiku-4-5";
var SYSTEM_PROMPT2 = `You are categorizing Israeli bank and credit-card transactions for a personal finance planning tool used by a CFP advisor.

Return ONLY a JSON array. Each item must have:
  { "index": <number>, "category": <string>, "confidence": <1-5>, "alternatives": ["category_key_1", "category_key_2", "category_key_3"] }

Rules:
- "index" matches the input order (use the [N] number we provide)
- "category" must be one of the provided LEAF category keys EXACTLY (lower-case, snake_case)
- The category list is grouped under parent headers for context (\u05D3\u05D9\u05D5\u05E8, \u05DE\u05D6\u05D5\u05DF, \u05E2\u05E1\u05E7\u05D9, \u2026).
  Parent headers are NOT valid category values \u2014 always pick a leaf under one of them.
- "confidence": 1 = guessing, 3 = reasonable, 5 = certain
- "alternatives": include up to 3 likely LEAF category keys, ordered best-first. Put "category" first when possible.
- Hebrew merchant names are common \u2014 recognize Israeli brands (\u05E9\u05D5\u05E4\u05E8\u05E1\u05DC, \u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9, \u05DE\u05E7\u05D3\u05D5\u05E0\u05DC\u05D3\u05E1, \u05D0\u05DC\u05E7\u05D8\u05E8\u05D4, etc.)
- "transfers" is ONLY for movements between own accounts (Bit between people IS transfers; Bit to a merchant is NOT)
- Business descriptors (Google Ads, \u05DE\u05E2"\u05DE, \u05DE\u05E7\u05D3\u05DE\u05EA \u05DE\u05E1, fiverr, \u05E8\u05D5\u05D0\u05D4 \u05D7\u05E9\u05D1\u05D5\u05DF, \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05E2\u05E1\u05E7\u05D9, Stripe, Cardcom) \u2192 use the matching business_* category
- Refunds / \u05D6\u05D9\u05DB\u05D5\u05D9\u05D9\u05DD / \u05D4\u05D7\u05D6\u05E8\u05D9\u05DD \u2192 "refunds"
- If genuinely uncertain \u2192 "other" with confidence: 1
- If you don't recognize the merchant, use your web search capabilities to identify the business in Israel before classifying.
- NEVER invent new categories \u2014 only use ones in the list
- NEVER add commentary outside the JSON array`;
async function categorizeWithAI(txs, pastCorrections = [], aiModel = "haiku") {
  if (txs.length === 0) return [];
  if (aiModel === "haiku" && !getAnthropicKey()) return [];
  if (aiModel === "perplexity" && !getPerplexityKey()) return [];
  const grouped = groupOptionsByParent(CATEGORIES.map((c) => ({ key: c.key, label: c.label })));
  const groupedList = grouped.map(
    (g) => `\u25B6 ${g.parent.label}
${g.options.map((o) => `   - ${o.key}: ${o.label}`).join("\n")}`
  ).join("\n");
  const categoriesBlock = `${groupedList}

\u25B6 \u05E9\u05D5\u05E0\u05D5\u05EA
   - other: \u05D0\u05D7\u05E8 (use when truly unable to classify)`;
  const correctionsBlock = pastCorrections.length > 0 ? `

Past user corrections (these are authoritative \u2014 match the pattern when you see similar descriptions):
${pastCorrections.slice(0, 30).map((c) => `  "${c.description}" \u2192 ${c.category}`).join("\n")}` : "";
  const txsBlock = txs.map((t) => {
    const suffix = t.currentGuess ? ` (keyword guess: ${t.currentGuess})` : "";
    return `[${t.index}] "${t.description}"${suffix}`;
  }).join("\n");
  const userPrompt = `Categories:
${categoriesBlock}${correctionsBlock}

Transactions to classify:
${txsBlock}

Return the JSON array now.`;
  let text = "";
  try {
    if (aiModel === "perplexity") {
      const response = await createPerplexityCompletion([
        { role: "system", content: SYSTEM_PROMPT2 },
        { role: "user", content: userPrompt }
      ], "sonar-pro");
      text = response.choices[0]?.message.content || "";
    } else {
      const client2 = createAnthropicClient();
      if (!client2) return [];
      const response = await client2.messages.create({
        model: MODEL2,
        max_tokens: 4096,
        // System prompt is fixed — cache it so repeat calls within 5 minutes
        // pay the cache-read rate (~0.1× input).
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT2,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [{ role: "user", content: userPrompt }]
      });
      text = response.content[0].type === "text" ? response.content[0].text : "";
    }
  } catch (err) {
    console.error("[ai-categorizer] AI call failed:", err instanceof Error ? err.message : err);
    return [];
  }
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const validKeys = new Set(CATEGORIES.map((c) => c.key));
  validKeys.add("other");
  const labelByKey = new Map(CATEGORIES.map((c) => [c.key, c.label]));
  labelByKey.set("other", "\u05D0\u05D7\u05E8");
  const out = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item;
    const idx = typeof obj.index === "number" ? obj.index : Number(obj.index);
    const cat = typeof obj.category === "string" ? obj.category.toLowerCase().trim() : "";
    const rawConf = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
    if (!Number.isFinite(idx) || !validKeys.has(cat)) continue;
    const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf / 5)) : 0.7;
    out.push({
      index: idx,
      category: cat,
      categoryLabel: labelByKey.get(cat) || cat,
      confidence,
      alternatives: Array.isArray(obj.alternatives) ? obj.alternatives.filter((k) => typeof k === "string").map((k) => k.toLowerCase().trim()).filter((k) => validKeys.has(k)).filter((k, i, arr) => arr.indexOf(k) === i).slice(0, 3).map((k) => ({ category: k, categoryLabel: labelByKey.get(k) || k })) : [{ category: cat, categoryLabel: labelByKey.get(cat) || cat }]
    });
  }
  return out;
}
async function interactiveCategorizeWithAI(merchantKey, userDescription, aiModel = "haiku") {
  if (aiModel === "haiku" && !getAnthropicKey()) return null;
  if (aiModel === "perplexity" && !getPerplexityKey()) return null;
  const validKeys = new Set(CATEGORIES.map((c) => c.key));
  validKeys.add("other");
  const labelByKey = new Map(CATEGORIES.map((c) => [c.key, c.label]));
  labelByKey.set("other", "\u05D0\u05D7\u05E8");
  const grouped = groupOptionsByParent(CATEGORIES.map((c) => ({ key: c.key, label: c.label })));
  const groupedList = grouped.map(
    (g) => `\u25B6 ${g.parent.label}
${g.options.map((o) => `   - ${o.key}: ${o.label}`).join("\n")}`
  ).join("\n");
  const categoriesBlock = `${groupedList}

\u25B6 \u05E9\u05D5\u05E0\u05D5\u05EA
   - other: \u05D0\u05D7\u05E8 (use when truly unable to classify)`;
  const INTERACTIVE_SYSTEM_PROMPT = `You are an expert Israeli financial assistant. 
The user is asking for help categorizing a business for their financial tracking.
Business Name: "${merchantKey}"
User's Description: "${userDescription}"

Categories available:
${categoriesBlock}

Instructions:
1. Return a JSON object with EXACTLY this structure:
{
  "explanation": "A short, friendly explanation in Hebrew (1-2 sentences) of why you chose these categories.",
  "suggestions": ["category_key_1", "category_key_2"]
}
2. "suggestions" must be an array of 1 to 3 valid leaf category keys from the list above. Order them by best fit first.
3. Keep the "explanation" short, clear, and in Hebrew.
4. Output ONLY the JSON object, nothing else.`;
  let text = "";
  try {
    if (aiModel === "perplexity") {
      const response = await createPerplexityCompletion([
        { role: "system", content: "You are a helpful assistant that strictly outputs JSON." },
        { role: "user", content: INTERACTIVE_SYSTEM_PROMPT }
      ], "sonar-pro");
      text = response.choices[0]?.message.content || "";
    } else {
      const client2 = createAnthropicClient();
      if (!client2) return null;
      const response = await client2.messages.create({
        model: MODEL2,
        max_tokens: 1024,
        messages: [{ role: "user", content: INTERACTIVE_SYSTEM_PROMPT }]
      });
      text = response.content[0].type === "text" ? response.content[0].text : "";
    }
  } catch (err) {
    console.error("[ai-categorizer] Interactive AI call failed:", err instanceof Error ? err.message : err);
    return null;
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) return null;
    const validSuggestions = parsed.suggestions.filter((k) => typeof k === "string" && validKeys.has(k)).slice(0, 3).map((k) => ({ category: k, categoryLabel: labelByKey.get(k) || k }));
    return {
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      suggestions: validSuggestions
    };
  } catch {
    return null;
  }
}

// src/routes/categorize.ts
var categorizeRouter = Router9();
categorizeRouter.use(requireUser);
var MAX_TXS = 200;
var BodySchema2 = z5.object({
  transactions: z5.array(z5.record(z5.string(), z5.unknown())).max(MAX_TXS).optional(),
  pastCorrections: z5.array(z5.record(z5.string(), z5.unknown())).max(2e3).optional()
});
function pickModel(cookie) {
  return cookie === "perplexity" ? "perplexity" : "haiku";
}
categorizeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `categorize:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1e3)));
      res.status(429).json({ error: "\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05D1\u05E7\u05E9\u05D5\u05EA \u05E1\u05D9\u05D5\u05D5\u05D2. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4." });
      return;
    }
    const parsed = validate(req.body, BodySchema2, res);
    if (!parsed.ok) return;
    const txs = parsed.data.transactions ?? [];
    const corrections = parsed.data.pastCorrections ?? [];
    if (txs.length === 0) {
      res.json({ suggestions: [] });
      return;
    }
    const aiModel = pickModel(req.cookies?.ai_categorizer_model);
    const suggestions = await categorizeWithAI(txs, corrections, aiModel);
    res.json({ suggestions });
  })
);
var InteractiveSchema = z5.object({
  merchantKey: z5.string().trim().min(1).max(500),
  description: z5.string().trim().min(1).max(2e3)
});
categorizeRouter.post(
  "/interactive",
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `categorize-interactive:${ip}`, ...RATE_LIMITS.PARSE });
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.resetAt - Date.now()) / 1e3)));
      res.status(429).json({ error: "\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05E7\u05E8\u05D9\u05D0\u05D5\u05EA, \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4." });
      return;
    }
    const parsed = validate(req.body, InteractiveSchema, res);
    if (!parsed.ok) return;
    const aiModel = pickModel(req.cookies?.ai_categorizer_model);
    const result = await interactiveCategorizeWithAI(parsed.data.merchantKey, parsed.data.description, aiModel);
    if (!result) {
      res.status(500).json({ error: "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E7\u05D1\u05DC\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05D4-AI" });
      return;
    }
    res.json(result);
  })
);

// src/routes/merchant-category-rules.ts
import { Router as Router10 } from "express";

// src/lib/safe-json.ts
init_report_error();
function safeParse(raw, fallback, scope = "safeParse") {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    reportError(scope, e);
    return fallback;
  }
}

// src/routes/merchant-category-rules.ts
var merchantCategoryRulesRouter = Router10();
merchantCategoryRulesRouter.use(requireUser);
var MAX_BULK_VOTES = 1e3;
function cleanText2(value) {
  return typeof value === "string" ? value.replace(/["‏‎]/g, "").replace(/\s+/g, " ").trim().toLowerCase() : "";
}
function normalizeVote(input) {
  const merchantKey = cleanText2(input?.merchantKey);
  const categoryKey = cleanText2(input?.categoryKey);
  const txCount = Math.max(1, Math.floor(Number(input?.txCount) || 1));
  const sampleDescription = typeof input?.sampleDescription === "string" ? input.sampleDescription.trim() : void 0;
  const sourceFile = typeof input?.sourceFile === "string" ? input.sourceFile.trim() : void 0;
  if (!merchantKey || !categoryKey) return null;
  return { merchantKey, categoryKey, txCount, sampleDescription, sourceFile };
}
merchantCategoryRulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rules = await loadMerchantCategoryRulesFromDb(req.sb);
    res.json({ rules });
  })
);
merchantCategoryRulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body;
    const votes = Array.isArray(body?.votes) ? body.votes.map(normalizeVote).filter(Boolean) : body?.vote ? [normalizeVote(body.vote)].filter(Boolean) : [];
    if (votes.length === 0) {
      res.json({ ok: true, inserted: 0 });
      return;
    }
    if (votes.length > MAX_BULK_VOTES) {
      res.status(413).json({ ok: false, error: "too_many_votes" });
      return;
    }
    try {
      const { inserted } = await insertMerchantCategoryVotes(
        req.sb,
        req.user.id,
        votes
      );
      const rules = await primeMerchantCategoryRulesCacheFromDb(req.sb);
      res.json({ ok: true, inserted, rules });
    } catch (error) {
      console.error("[merchant-category-rules] write failed:", error);
      res.status(500).json({ ok: false, error: "write_failed" });
    }
  })
);
merchantCategoryRulesRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    try {
      const merchantKey = typeof req.query.merchantKey === "string" ? req.query.merchantKey : null;
      const merchantKeysRaw = typeof req.query.merchantKeys === "string" ? req.query.merchantKeys : null;
      let keysToDelete = [];
      if (merchantKey) {
        keysToDelete.push(merchantKey);
      } else if (merchantKeysRaw) {
        const parsed = safeParse(merchantKeysRaw, null, "merchant-rules:DELETE");
        if (Array.isArray(parsed)) {
          keysToDelete = parsed.filter((k) => typeof k === "string");
        }
      }
      if (keysToDelete.length === 0) {
        res.status(400).json({ ok: false, error: "missing_keys" });
        return;
      }
      await deleteMerchantCategoryVotes(req.sb, keysToDelete);
      const rules = await primeMerchantCategoryRulesCacheFromDb(req.sb);
      res.json({ ok: true, deleted: true, rules });
    } catch (error) {
      console.error("[merchant-category-rules] delete failed:", error);
      res.status(500).json({ ok: false, error: "delete_failed" });
    }
  })
);

// src/routes/auth.ts
import { Router as Router11 } from "express";
var authRouter = Router11();
authRouter.use(requireUser);
authRouter.get(
  "/resolve-landing",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const user = req.user;
    const { data: advisor } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();
    if (advisor) {
      res.json({ target: "/crm" });
      return;
    }
    let { data: client2 } = await sb.from("client_users").select("household_id").eq("user_id", user.id).maybeSingle();
    if (!client2 && user.email) {
      const { data: invite } = await sb.from("client_invites").select("token, household_id").eq("email", user.email.toLowerCase()).is("consumed_at", null).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (invite) {
        await sb.from("client_users").insert({
          user_id: user.id,
          household_id: invite.household_id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? null
        });
        await sb.from("client_invites").update({ consumed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("token", invite.token);
        client2 = { household_id: invite.household_id };
      }
    }
    if (!client2) {
      res.json({ target: "/login?error=missing_role" });
      return;
    }
    res.json({ target: "/dashboard" });
  })
);

// src/routes/crypto.ts
init_report_error();
import { Router as Router12 } from "express";
import crypto from "node:crypto";
import { z as z6 } from "zod";
var cryptoRouter = Router12();
cryptoRouter.use(requireUser);
var BINANCE_BASE = "https://api.binance.com";
var RECV_WINDOW = 1e4;
var BodySchema3 = z6.object({
  apiKey: z6.string().trim().min(1).max(256),
  secret: z6.string().trim().min(1).max(256)
});
cryptoRouter.post(
  "/binance/balances",
  asyncHandler(async (req, res) => {
    const parsed = validate(req.body, BodySchema3, res);
    if (!parsed.ok) return;
    const { apiKey: apiKey2, secret } = parsed.data;
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&recvWindow=${RECV_WINDOW}`;
    const signature = crypto.createHmac("sha256", secret).update(queryString).digest("hex");
    const url = `${BINANCE_BASE}/api/v3/account?${queryString}&signature=${signature}`;
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey2 },
        signal: AbortSignal.timeout(15e3)
      });
      if (!r.ok) {
        const text = await r.text();
        let detail = text;
        try {
          detail = JSON.parse(text);
        } catch (e) {
          reportError("api/crypto/binance/balances", e);
        }
        res.status(r.status === 401 || r.status === 403 ? 401 : 502).json({ error: `Binance returned ${r.status}`, detail });
        return;
      }
      const data = await r.json();
      const balances = (data.balances ?? []).map((b) => {
        const free = parseFloat(b.free) || 0;
        const locked = parseFloat(b.locked) || 0;
        return { asset: b.asset, free, locked, total: free + locked };
      }).filter((b) => b.total > 0);
      res.json({ balances });
    } catch (err) {
      res.status(502).json({
        error: "Failed to reach Binance",
        message: err instanceof Error ? err.message : String(err)
      });
    }
  })
);

// src/routes/invites.ts
import { Router as Router13 } from "express";
import { randomBytes as randomBytes2 } from "node:crypto";

// ../lib/email/resend.ts
import { Resend } from "resend";
var apiKey = process.env.RESEND_API_KEY;
var FROM = process.env.RESEND_FROM || "Plan <noreply@plan.local>";
var client = null;
function getClient() {
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}
async function sendEmail(msg) {
  const c = getClient();
  if (!c) {
    console.info(
      `[resend:dev] would send to=${Array.isArray(msg.to) ? msg.to.join(",") : msg.to} subject="${msg.subject}"
${msg.text}`
    );
    return { ok: true, id: "dev-noop" };
  }
  try {
    const res = await c.emails.send({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo
    });
    if (res.error) {
      return { ok: false, error: res.error?.message || "send failed" };
    }
    return { ok: true, id: res.data?.id };
  } catch (e) {
    return { ok: false, error: e?.message || "send threw" };
  }
}

// ../lib/email/templates.ts
function inviteEmail(p) {
  const greeting = p.clientName ? `\u05E9\u05DC\u05D5\u05DD ${p.clientName},` : "\u05E9\u05DC\u05D5\u05DD,";
  const subject = `${p.advisorName} \u05DE\u05D6\u05DE\u05D9\u05DF/\u05D4 \u05D0\u05D5\u05EA\u05DA \u05DC-Plan \u2014 \u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05EA\u05DB\u05E0\u05D5\u05DF \u05D4\u05E4\u05D9\u05E0\u05E0\u05E1\u05D9`;
  const text = [
    greeting,
    "",
    `${p.advisorName} \u05E4\u05EA\u05D7/\u05D4 \u05E2\u05D1\u05D5\u05E8\u05DA \u05D7\u05E9\u05D1\u05D5\u05DF \u05D0\u05D9\u05E9\u05D9 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA Plan \u2014 \u05DB\u05DC\u05D9 \u05EA\u05DB\u05E0\u05D5\u05DF \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9 \u05E9\u05D9\u05E2\u05D6\u05D5\u05E8 \u05DC\u05DA \u05DC\u05E8\u05D0\u05D5\u05EA \u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4 \u05D4\u05DB\u05D5\u05DC\u05DC\u05EA \u05E9\u05DC \u05D4\u05DE\u05E9\u05E4\u05D7\u05D4: \u05EA\u05D6\u05E8\u05D9\u05DD, \u05DE\u05D8\u05E8\u05D5\u05EA, \u05E4\u05E0\u05E1\u05D9\u05D4, \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA \u05D5\u05E0\u05D3\u05DC"\u05DF.`,
    "",
    "\u05DB\u05D3\u05D9 \u05DC\u05D4\u05E4\u05E2\u05D9\u05DC \u05D0\u05EA \u05D4\u05D7\u05E9\u05D1\u05D5\u05DF, \u05D4\u05D9\u05DB\u05E0\u05E1/\u05D9 \u05D3\u05E8\u05DA \u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D1\u05D0:",
    p.inviteUrl,
    "",
    "\u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05EA\u05E7\u05E3 \u05DC-7 \u05D9\u05DE\u05D9\u05DD. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3 \u2014 \u05E4\u05E0\u05D4/\u05D9 \u05DC\u05D9\u05D5\u05E2\u05E5/\u05EA \u05DC\u05E7\u05D1\u05DC\u05EA \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9.",
    "",
    "\u05E9\u05D0\u05DC\u05D5\u05EA? \u05E4\u05E9\u05D5\u05D8 \u05D4\u05E9\u05D1/\u05D9 \u05DC\u05DE\u05D9\u05D9\u05DC \u05D4\u05D6\u05D4 \u05D5\u05E0\u05D7\u05D6\u05D5\u05E8 \u05D0\u05DC\u05D9\u05DA.",
    "",
    "\u05D1\u05D4\u05E6\u05DC\u05D7\u05D4,",
    "\u05E6\u05D5\u05D5\u05EA Plan"
  ].join("\n");
  const html = `<div dir="rtl" style="font-family: 'Assistant', system-ui, -apple-system, sans-serif; color:#012D1D; max-width:560px; margin:0 auto; padding:24px;">
  <p style="font-size:16px;">${greeting}</p>
  <p style="font-size:15px; line-height:1.7;">
    <strong>${p.advisorName}</strong> \u05E4\u05EA\u05D7/\u05D4 \u05E2\u05D1\u05D5\u05E8\u05DA \u05D7\u05E9\u05D1\u05D5\u05DF \u05D0\u05D9\u05E9\u05D9 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA <strong>Plan</strong> \u2014
    \u05DB\u05DC\u05D9 \u05EA\u05DB\u05E0\u05D5\u05DF \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9 \u05E9\u05D9\u05E2\u05D6\u05D5\u05E8 \u05DC\u05DA \u05DC\u05E8\u05D0\u05D5\u05EA \u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4 \u05D4\u05DB\u05D5\u05DC\u05DC\u05EA \u05E9\u05DC \u05D4\u05DE\u05E9\u05E4\u05D7\u05D4: \u05EA\u05D6\u05E8\u05D9\u05DD, \u05DE\u05D8\u05E8\u05D5\u05EA,
    \u05E4\u05E0\u05E1\u05D9\u05D4, \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA \u05D5\u05E0\u05D3\u05DC"\u05DF.
  </p>
  <p style="font-size:15px; line-height:1.7;">\u05DB\u05D3\u05D9 \u05DC\u05D4\u05E4\u05E2\u05D9\u05DC \u05D0\u05EA \u05D4\u05D7\u05E9\u05D1\u05D5\u05DF, \u05DC\u05D7\u05E5/\u05D9 \u05E2\u05DC \u05D4\u05DB\u05E4\u05EA\u05D5\u05E8:</p>
  <p style="text-align:center; margin:32px 0;">
    <a href="${p.inviteUrl}"
       style="display:inline-block; background:#1B4332; color:#F9FAF2; padding:14px 28px; border-radius:12px; text-decoration:none; font-weight:800; font-size:15px;">
      \u05E4\u05EA\u05D9\u05D7\u05EA \u05D4\u05D7\u05E9\u05D1\u05D5\u05DF
    </a>
  </p>
  <p style="font-size:13px; color:#5a7a6a;">
    \u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05EA\u05E7\u05E3 \u05DC-7 \u05D9\u05DE\u05D9\u05DD. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3, \u05E4\u05E0\u05D4/\u05D9 \u05DC\u05D9\u05D5\u05E2\u05E5/\u05EA \u05DC\u05E7\u05D1\u05DC\u05EA \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9.
  </p>
  <hr style="border:0; border-top:1px solid #eef2e8; margin:24px 0;" />
  <p style="font-size:12px; color:#5a7a6a;">
    \u05E9\u05D0\u05DC\u05D5\u05EA? \u05E4\u05E9\u05D5\u05D8 \u05D4\u05E9\u05D1/\u05D9 \u05DC\u05DE\u05D9\u05D9\u05DC \u05D4\u05D6\u05D4.
    <br />\u05E6\u05D5\u05D5\u05EA Plan
  </p>
</div>`.trim();
  return { subject, text, html };
}

// src/routes/invites.ts
var invitesRouter = Router13();
invitesRouter.use(requireUser, requireAdvisor);
invitesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const user = req.user;
    const { data: advisor } = await sb.from("advisors").select("id, full_name").eq("id", user.id).maybeSingle();
    const rl = rateLimit({ key: `invite:${user.id}`, ...RATE_LIMITS.INVITE });
    if (!rl.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1e3));
      res.set({
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1e3))
      });
      res.status(429).json({ error: "rate_limited", retryAfter: retryAfterSec });
      return;
    }
    const body = req.body || {};
    const email = (body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }
    let householdId = body.householdId?.trim() || "";
    if (householdId) {
      const { data: owned } = await sb.from("households").select("id").eq("id", householdId).eq("advisor_id", user.id).maybeSingle();
      if (!owned) {
        res.status(403).json({ error: "household_not_owned" });
        return;
      }
    } else {
      const familyName = (body.familyName || body.fullName || "\u05DE\u05E9\u05E4\u05D7\u05D4 \u05D7\u05D3\u05E9\u05D4").trim();
      const { data: created, error: hhErr } = await sb.from("households").insert({ advisor_id: user.id, family_name: familyName, members_count: 1, stage: "onboarding" }).select("id").single();
      if (hhErr || !created) {
        res.status(500).json({ error: "household_create_failed", detail: hhErr?.message || "Unknown error" });
        return;
      }
      householdId = created.id;
    }
    const token = randomBytes2(32).toString("base64url");
    const { error: insErr } = await sb.from("client_invites").insert({
      token,
      advisor_id: user.id,
      household_id: householdId,
      email
    });
    if (insErr) {
      res.status(500).json({
        error: "invite_create_failed",
        detail: insErr.message,
        hint: "\u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05DE\u05D9\u05D2\u05E8\u05E6\u05D9\u05D4 0011 \u05E2\u05D5\u05D3 \u05DC\u05D0 \u05D4\u05D5\u05E8\u05E6\u05D4 \u05D1-Supabase (\u05D7\u05E1\u05E8\u05D4 \u05D8\u05D1\u05DC\u05EA client_invites)."
      });
      return;
    }
    const origin = env.FRONTEND_URL;
    const inviteUrl = `${origin}/login?invite=${encodeURIComponent(token)}`;
    const directPassword = (body.password || "").trim();
    let emailSent = false;
    let emailError;
    let passwordCreated = false;
    try {
      const admin = createAdminClient();
      if (directPassword) {
        const { error: createErr } = await admin.auth.admin.createUser({
          email,
          password: directPassword,
          email_confirm: true,
          user_metadata: {
            invite_token: token,
            full_name: body.fullName || void 0,
            family_name: body.familyName || void 0,
            invited_by: advisor?.full_name || void 0
          }
        });
        if (createErr) emailError = createErr.message;
        else passwordCreated = true;
      } else {
        const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: {
            invite_token: token,
            full_name: body.fullName || void 0,
            family_name: body.familyName || void 0,
            invited_by: advisor?.full_name || void 0
          },
          redirectTo: `${origin}/auth/callback`
        });
        if (mailErr) {
          if (/already been registered|already registered/i.test(mailErr.message)) {
            const tpl = inviteEmail({
              clientName: body.fullName || void 0,
              advisorName: advisor?.full_name || "\u05D4\u05DE\u05EA\u05DB\u05E0\u05DF \u05E9\u05DC\u05DA",
              inviteUrl
            });
            const r = await sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
            if (r.ok) emailSent = true;
            else emailError = `user_exists: ${r.error || "resend_failed"}`;
          } else {
            emailError = mailErr.message;
          }
        } else {
          emailSent = true;
        }
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : "send_failed";
    }
    res.json({ ok: true, token, inviteUrl, householdId, email, emailSent, emailError, passwordCreated });
  })
);
invitesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data: invites, error } = await req.sb.from("client_invites").select("token, email, household_id, created_at, consumed_at, expires_at").eq("advisor_id", req.user.id).order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ invites: invites || [] });
  })
);

// src/routes/impersonate.ts
import { Router as Router14 } from "express";
var impersonateRouter = Router14();
var COOKIE = "plan_impersonate_hh";
var MAX_AGE_MS = 60 * 60 * 8 * 1e3;
function cookieOpts(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeMs
  };
}
impersonateRouter.use(requireUser, requireAdvisor);
impersonateRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const householdId = String(req.body?.householdId || "").trim();
    if (!householdId) {
      res.status(400).json({ error: "missing_household_id" });
      return;
    }
    const { data: owned } = await sb.from("households").select("id, family_name").eq("id", householdId).eq("advisor_id", req.user.id).maybeSingle();
    if (!owned) {
      res.status(403).json({ error: "household_not_owned" });
      return;
    }
    res.cookie(COOKIE, householdId, cookieOpts(MAX_AGE_MS));
    res.json({ ok: true, householdId, familyName: owned.family_name });
  })
);
impersonateRouter.delete("/", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});
var ALLOWED_NEXT = ["/dashboard", "/onboarding"];
function safeNextPath(value) {
  const next = (typeof value === "string" ? value : "/dashboard").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  if (!ALLOWED_NEXT.some((p) => next === p || next.startsWith(p + "?"))) return "/dashboard";
  return next;
}
impersonateRouter.get(
  "/enter",
  asyncHandler(async (req, res) => {
    const householdId = String(req.query.household_id || "").trim();
    const nextPath = safeNextPath(req.query.next);
    if (!householdId) {
      res.status(400).json({ ok: false, error: "missing household_id" });
      return;
    }
    const { data: owned } = await req.sb.from("households").select("id").eq("id", householdId).eq("advisor_id", req.user.id).maybeSingle();
    if (!owned) {
      res.status(403).json({ ok: false, error: "not_owned" });
      return;
    }
    res.cookie(COOKIE, householdId, cookieOpts(MAX_AGE_MS));
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ ok: true, next: nextPath, householdId });
  })
);
impersonateRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const cookieValue = req.cookies?.[COOKIE] ?? null;
    if (!cookieValue) {
      res.json({ impersonating: false });
      return;
    }
    const { data: owned } = await req.sb.from("households").select("id, family_name").eq("id", cookieValue).eq("advisor_id", req.user.id).maybeSingle();
    if (!owned) {
      res.json({ impersonating: false });
      return;
    }
    res.json({ impersonating: true, householdId: owned.id, familyName: owned.family_name });
  })
);
impersonateRouter.get(
  "/debug",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const user = req.user;
    const cookieValue = req.cookies?.[COOKIE] ?? null;
    const { data: advisor } = await sb.from("advisors").select("id").eq("id", user.id).maybeSingle();
    let cookieResolves = null;
    let cookieResolveError = null;
    if (cookieValue) {
      const { data, error } = await sb.from("households").select("id, family_name").eq("id", cookieValue).eq("advisor_id", user.id).maybeSingle();
      if (error) cookieResolveError = error.message;
      else cookieResolves = data;
    }
    const { data: ownedHouseholds } = await sb.from("households").select("id, family_name, created_at").eq("advisor_id", user.id).order("created_at", { ascending: false });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      ok: true,
      user_id: user.id,
      is_advisor: !!advisor,
      cookie: { name: COOKIE, value: cookieValue, present: !!cookieValue },
      cookie_resolves_to: cookieResolves,
      cookie_resolve_error: cookieResolveError,
      owned_households: ownedHouseholds || [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  })
);

// src/routes/pension.ts
import { Router as Router15 } from "express";

// ../lib/doc-parser/annual-report-parser.ts
import pdfParse2 from "pdf-parse";
import * as XLSX2 from "xlsx";
var PROVIDER_HINTS = [
  // More-specific brand names first so they win ties (e.g. "אלטשולר שחם").
  ["\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8 \u05E9\u05D7\u05DD", ["\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8 \u05E9\u05D7\u05DD", "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8", "altshuler"]],
  ["\u05D4\u05E8\u05D0\u05DC", ["\u05D4\u05E8\u05D0\u05DC", "harel"]],
  ["\u05DE\u05D2\u05D3\u05DC", ["\u05DE\u05D2\u05D3\u05DC", "\u05DE\u05E7\u05E4\u05EA", "magdal", "migdal", "makefet"]],
  ["\u05DE\u05E0\u05D5\u05E8\u05D4", ["\u05DE\u05E0\u05D5\u05E8\u05D4", "menora", "\u05DE\u05D1\u05D8\u05D7\u05D9\u05DD"]],
  ["\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1", ["\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1", "phoenix", "fnx"]],
  ["\u05DE\u05D9\u05D8\u05D1", ["\u05DE\u05D9\u05D8\u05D1 \u05D3\u05E9", "meitav"]],
  ["\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8", ["\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8", "analyst"]],
  ["\u05D9\u05DC\u05D9\u05DF \u05DC\u05E4\u05D9\u05D3\u05D5\u05EA", ["\u05D9\u05DC\u05D9\u05DF", "yelin", "lapidot"]],
  ["\u05DB\u05DC\u05DC", ["\u05DB\u05DC\u05DC \u05D1\u05D9\u05D8\u05D5\u05D7", "clal"]],
  ["\u05DE\u05D5\u05E8", ["\u05DE\u05D5\u05E8 \u05D2\u05DE\u05DC", "\u05DE\u05D5\u05E8 \u05E4\u05E0\u05E1\u05D9\u05D4", "\u05DE\u05D5\u05E8 \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA"]],
  ["\u05E4\u05E1\u05D2\u05D5\u05EA", ["\u05E4\u05E1\u05D2\u05D5\u05EA", "psagot"]],
  ["\u05D0\u05D9\u05E0\u05E4\u05D9\u05E0\u05D9\u05D8\u05D9", ["\u05D0\u05D9\u05E0\u05E4\u05D9\u05E0\u05D9\u05D8\u05D9", "infinity"]]
];
function detectProvider(text) {
  const lower = text.toLowerCase();
  let best = "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4";
  let bestCount = 0;
  for (const [name, kws] of PROVIDER_HINTS) {
    let count = 0;
    for (const k of kws) {
      const needle = k.toLowerCase();
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        count++;
        idx = lower.indexOf(needle, idx + needle.length);
      }
    }
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
var PRODUCT_HINTS = [
  ["pension_comprehensive", "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05DE\u05E7\u05D9\u05E4\u05D4", ["\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05DE\u05E7\u05D9\u05E4\u05D4 \u05D7\u05D3\u05E9\u05D4", "\u05E4\u05E0\u05E1\u05D9\u05D4 \u05DE\u05E7\u05D9\u05E4\u05D4"]],
  ["pension_general", "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA", ["\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA", "\u05E4\u05E0\u05E1\u05D9\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA"]],
  ["pension_comprehensive", "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4", ["\u05D3\u05D5\u05D7 \u05E9\u05E0\u05EA\u05D9 \u05DE\u05E4\u05D5\u05E8\u05D8 \u05D1\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4", "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D4"]],
  ["insurance_manager", "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DE\u05E0\u05D4\u05DC\u05D9\u05DD", ["\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DE\u05E0\u05D4\u05DC\u05D9\u05DD"]],
  ["hishtalmut", "\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA", ["\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA", "\u05D1\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA"]],
  ["gemel_investment", "\u05D2\u05DE\u05DC \u05DC\u05D4\u05E9\u05E7\u05E2\u05D4", ["\u05D2\u05DE\u05DC \u05DC\u05D4\u05E9\u05E7\u05E2\u05D4"]],
  ["gemel", "\u05E7\u05D5\u05E4\u05EA \u05D2\u05DE\u05DC", ["\u05E7\u05D5\u05E4\u05EA \u05D2\u05DE\u05DC", "\u05D1\u05E7\u05D5\u05E4\u05EA \u05D2\u05DE\u05DC"]]
];
function detectProduct(text) {
  if (/סוג\s*הקרן\s*כללית/.test(text) || text.includes("\u05DE\u05E7\u05E4\u05EA \u05DE\u05E9\u05DC\u05D9\u05DE\u05D4")) {
    return { type: "pension_general", label: "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA" };
  }
  for (const [type, label, kws] of PRODUCT_HINTS) {
    if (kws.some((k) => text.includes(k))) return { type, label };
  }
  return { type: "unknown", label: "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2" };
}
function parseAmount(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/[₪$\s\u200E\u200F]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function lastNumberInBlob(blob) {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (!all || !all.length) return void 0;
  return parseAmount(all[all.length - 1]);
}
function firstNumberInBlob(blob) {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (!all || !all.length) return void 0;
  return parseAmount(all[0]);
}
function numbersInBlob(blob) {
  const all = blob.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  return all ? all.map(parseAmount) : [];
}
function cleanHebrewPdfText(value) {
  if (!value) return void 0;
  return value.replace(/[\u200E\u200F]/g, "").replace(/\s+/g, " ").replace(/\)\s*([^()]+?)\s*\(/g, "($1)").replace(/(\d{4}\))(?=[\u0590-\u05FF])/g, "$1 ").trim();
}
function parseDate(s) {
  if (!s) return "";
  const m = String(s).match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (!m) return String(s).trim();
  const [, d, mo, y] = m;
  const yr = y.length === 2 ? `20${y}` : y;
  return `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function firstMatch(text, patterns) {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m && m[1]) return m[1].trim();
  }
  return void 0;
}
function extractCustomer(text) {
  const idMatch = text.match(/(\d{9})\s*מספר\s*תעודת\s*זהות/) || text.match(/מספר\s*תעודת\s*זהות\s*\n?\s*(\d{9})/);
  const id = idMatch?.[1];
  const nameSlice = text.match(/מספר\s*תעודת\s*זהות([\u0590-\u05FF\s'"-]{1,40}?)שם\s*העמית/) || text.match(/שם\s*העמית(?:\/ה)?([\u0590-\u05FF\s'"-]{1,40}?)מספר\s*תעודת\s*זהות/);
  const name = nameSlice?.[1]?.replace(/[\u200E\u200F]/g, "").replace(/\s+/g, " ").trim();
  return { name, id };
}
function extractBalance(text, _reportDate) {
  const grandTotalMatch = text.match(/([\d,.]+)\s*סה[״"']כ\s*בש[״"']ח/);
  if (grandTotalMatch) {
    const v = lastNumberInBlob(grandTotalMatch[1]);
    if (v !== void 0) return v;
  }
  const breakdownMatches = [
    ...text.matchAll(/([\d,.]+)\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*יתרת\s*החיסכון\s*המצטבר/g)
  ];
  if (breakdownMatches.length) {
    const lastMatch = breakdownMatches[breakdownMatches.length - 1];
    const v = firstNumberInBlob(lastMatch[1]);
    if (v !== void 0) return v;
  }
  const labelFirstMatches = [
    ...text.matchAll(
      /יתרת\s*החיסכון\s*המצטבר\s*ל-\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*([\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2})/g
    ),
    ...text.matchAll(
      /יתרת\s*חיסכון\s*מצטבר\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*([\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2})/g
    )
  ];
  if (labelFirstMatches.length) {
    const nums = numbersInBlob(labelFirstMatches[labelFirstMatches.length - 1][1]);
    if (nums.length) return nums[nums.length - 1];
  }
  const reverseRows = [
    ...text.matchAll(
      /((?:-?\d{1,3}(?:,\d{3})*\.\d{2}\s*){3,4})\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*[-–]?\s*יתרת\s*החיסכון\s*המצטבר/g
    )
  ];
  if (reverseRows.length) {
    const nums = numbersInBlob(reverseRows[reverseRows.length - 1][1]);
    if (nums.length) return nums[0];
  }
  const altPatterns = [
    /([\d,.]+)\s*יתרת\s*הכספים\s*בקופה\s*בסוף\s*השנה/,
    /([\d,.]+)\s*יתרת\s*חיסכון\s*בסוף/,
    /יתרת\s*כספי\s*חסכון[\s:]*([\d,.]+)/
  ];
  for (const rx of altPatterns) {
    const m = text.match(rx);
    if (m) {
      const v = lastNumberInBlob(m[1]);
      if (v !== void 0) return v;
    }
  }
  return 0;
}
function extractReportDate(text) {
  const m = text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*תאריך\s*הדוח/);
  if (m) return parseDate(m[1]);
  const m2 = text.match(/תאריך\s*הדוח[:\s]*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/);
  if (m2) return parseDate(m2[1]);
  const m3 = text.match(
    /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*-\s*\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/
  );
  if (m3) return parseDate(m3[1]);
  return "";
}
function extractAccountNumber(text) {
  const patterns = [
    /(\d{6,12})\s*מספר\s*חשבון\s*העמית/,
    /מספר\s*חשבון\s*העמית[\s\/ה]*(\d{6,12})/,
    /(\d{6,12})\s*מספר\s*פוליסה/,
    /מספר\s*פוליסה[\s:]*(\d{6,12})/
  ];
  return firstMatch(text, patterns);
}
function extractEmployer(text) {
  const m = text.match(/\n([\u0590-\u05FF][\u0590-\u05FF '"-]{1,30}?)\s*שם\s*המעסיק\s*האחרון/) || text.match(/שם\s*המעסיק\s*האחרון\s*([\u0590-\u05FF0-9\s'"().-]{2,50}?)(?:מועד|תקופת|מסמכים|\n)/);
  if (!m) return void 0;
  const candidate = cleanHebrewPdfText(m[1]) || "";
  if (/ותק|מעמד|מצב|תקופ|מסלול|מספר|מועד|כתובת|לעניין|לפי/.test(candidate)) {
    return void 0;
  }
  return candidate;
}
function extractLiquidityDate(text) {
  const m = text.match(/למשיכה\s*חד\s*פעמית\s*החל\s*מ-?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/);
  return m ? parseDate(m[1]) : void 0;
}
function extractJoinDate(text) {
  const m = text.match(/(\d{1,2}[\/\.\-]\d{2,4})\s*מועד\s*הצטרפות/) || text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*מועד\s*תחילת\s*חישוב\s*ותק/);
  return m ? m[1] : void 0;
}
function extractPlanName(text) {
  const m = text.match(/מסלול\s*ההשקעה\s*בו\s*מנוהלים\s*כספי\s*החיסכון\s*הצבור([\s\S]{2,120}?)מסלול\s*ביטוח/) || text.match(/שם\s*מסלול\s*השקעה[\s\S]{0,100}?([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40})/) || text.match(/([\u0590-\u05FF][\u0590-\u05FF\s\-']{2,40}?)\s*מסלול\s*ההשקעה\s*בו\s*מנוהלים/);
  return cleanHebrewPdfText(m?.[1]);
}
function extractMgmtFees(text) {
  const balRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהחיסכון\s*המצטבר/);
  const depRow = text.match(/([\d.]+)%\s*[\d.,]+\s*דמי\s*ניהול\s*מהפקדה\s*שוטפת/);
  const balDiscount = text.match(
    /דמי\s*ניהול\s*מהחיסכון\s*המצטבר\s*([\d.]+)%\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/
  );
  const depDiscount = text.match(
    /דמי\s*ניהול\s*מהפקדה\s*שוטפת\s*([\d.]+)%\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/
  );
  const balForward = text.match(/שיעור\s*דמי\s*ניהול\s*מחיסכון\s*([\d.]+)%/);
  const depForward = text.match(/שיעור\s*דמי\s*ניהול\s*מהפקדה\s*([\d.]+)%/);
  return {
    balance: balDiscount ? parseFloat(balDiscount[1]) : balRow ? parseFloat(balRow[1]) : balForward ? parseFloat(balForward[1]) : void 0,
    deposit: depDiscount ? parseFloat(depDiscount[1]) : depRow ? parseFloat(depRow[1]) : depForward ? parseFloat(depForward[1]) : void 0
  };
}
function extractReturns(text) {
  const idx = text.indexOf("\u05EA\u05E9\u05D5\u05D0\u05D4 \u05E9\u05D4\u05D5\u05E9\u05D2\u05D4");
  const searchText = idx >= 0 ? text.slice(idx, idx + 1500) : text;
  const tableMatch = searchText.match(
    /([\d.]+)%\s*([\d.]+)%\s*([\d.]+)%\s*([\d.]+)%[\u0590-\u05FF\s\-'"]{2,40}?(?:כללי|מנייתי|אג["\u05F4]ח|כספי|s&p|מסלול|גילאי|השתלמות|מקיפה)/i
  );
  if (!tableMatch) return {};
  const nums = [1, 2, 3, 4].map((i) => parseFloat(tableMatch[i])).sort((a, b) => b - a);
  const fiveY = nums[0];
  const yr = nums[1] > 3 ? nums[1] : void 0;
  return { year: yr, fiveY };
}
function extractProjectedPension(text) {
  const m = text.match(/([\d,]+\.\d{2})\s*קצבה\s*חודשית\s*צפויה\s*בפרישה[\s\S]{0,40}?(\d{2})/);
  if (m) return { amount: parseAmount(m[1]), retireAge: parseInt(m[2], 10) };
  const forward = text.match(
    /קצבה\s*חודשית\s*צפויה\s*בפרישה[\s\S]{0,40}?גיל\s*(\d{2})[\s\S]{0,20}?([\d,]+\.\d{2})/
  );
  if (forward) return { amount: parseAmount(forward[2]), retireAge: parseInt(forward[1], 10) };
  const m2 = text.match(/([\d,]+\.\d{2})\s*קצבה\s*חודשית\s*צפויה\s*בפרישה/);
  if (m2) return { amount: parseAmount(m2[1]) };
  return {};
}
function extractSalaryBase(text) {
  const forward = text.match(/משכורת\s*קובעת\s*לנכות\s*ושאירים\s*([\d,]+\.\d{2})/);
  if (forward) return parseAmount(forward[1]);
  const m = text.match(/([\d,]+\.\d{2})\s*משכורת\s*קובעת/);
  if (m) return parseAmount(m[1]);
  return void 0;
}
function numberAfterLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}[^\\d\\n]{0,20}([\\d,]+\\.\\d{2})`));
  return m ? parseAmount(m[1]) : void 0;
}
function pctAfterLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}\\s*([\\d.]+)%`));
  return m ? parseFloat(m[1]) : void 0;
}
function extractStatus(text) {
  const m = text.match(/סוג\s*עמית(?:\/ה)?\s*([\u0590-\u05FF/]+)(?:מסלול|גיל|שם|מועד|\n)/) || text.match(/([\u0590-\u05FF/]+)\s*סוג\s*העמית/);
  const value = m?.[1] || "";
  if (value.includes("\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC")) return "inactive";
  if (value.includes("\u05E4\u05E2\u05D9\u05DC")) return "active";
  return "unknown";
}
function extractAnnualContributionsBreakdown(text) {
  const idx = text.indexOf("\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA");
  if (idx < 0) return void 0;
  const sub = text.slice(idx, idx + 4e3);
  const spacedTotal = sub.match(/סה[״"']כ\s*((?:[\d,]+\.\d{2}-?\s*){4})/);
  if (spacedTotal) {
    const nums = numbersInBlob(spacedTotal[1]);
    if (nums.length < 4) return void 0;
    return {
      employee: nums[0],
      employer: nums[1],
      severance: nums[2],
      total: nums[3]
    };
  }
  const reverseTotal = sub.match(/סה[״"']כ\s*\n?((?:[\d,]+\.\d{2}){4})/);
  if (reverseTotal) {
    const nums = numbersInBlob(reverseTotal[1]);
    if (nums.length >= 4) {
      return { total: nums[0], severance: nums[1], employer: nums[2], employee: nums[3] };
    }
  }
  return void 0;
}
function extractProjectedCoverages(text) {
  const coverages = {
    disabilityPct: pctAfterLabel(text, "\u05E9\u05D9\u05E2\u05D5\u05E8 \u05E7\u05E6\u05D1\u05EA \u05E0\u05DB\u05D5\u05EA \u05DE\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA \u05E7\u05D5\u05D1\u05E2\u05EA"),
    disabilityMonthly: numberAfterLabel(text, "\u05E7\u05E6\u05D1\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05E9\u05DC \u05E0\u05DB\u05D5\u05EA \u05DE\u05DC\u05D0\u05D4"),
    disabilityContributionWaiver: numberAfterLabel(text, "\u05E9\u05D7\u05E8\u05D5\u05E8 \u05DE\u05EA\u05E9\u05DC\u05D5\u05DD \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA \u05DC\u05E7\u05E8\u05DF \u05D1\u05DE\u05E7\u05E8\u05D4 \u05E9\u05DC \u05E0\u05DB\u05D5\u05EA"),
    spousePct: pctAfterLabel(text, "\u05E9\u05D9\u05E2\u05D5\u05E8 \u05E7\u05E6\u05D1\u05D4 \u05DC\u05D0\u05DC\u05DE\u05DF/\u05D4 \u05DE\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA \u05E7\u05D5\u05D1\u05E2\u05EA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    spouseMonthly: numberAfterLabel(text, "\u05E7\u05E6\u05D1\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA \u05DC\u05D0\u05DC\u05DE\u05DF/\u05EA \u05D4\u05E2\u05DE\u05D9\u05EA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    childPct: pctAfterLabel(text, "\u05E9\u05D9\u05E2\u05D5\u05E8 \u05E7\u05E6\u05D1\u05D4 \u05DC\u05D9\u05EA\u05D5\u05DD \u05DE\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA \u05E7\u05D5\u05D1\u05E2\u05EA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    childMonthly: numberAfterLabel(text, "\u05E7\u05E6\u05D1\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA \u05DC\u05D9\u05EA\u05D5\u05DD \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    parentPct: pctAfterLabel(text, "\u05E9\u05D9\u05E2\u05D5\u05E8 \u05E7\u05E6\u05D1\u05D4 \u05DC\u05D4\u05D5\u05E8\u05D4 \u05E0\u05EA\u05DE\u05DA \u05DE\u05DE\u05E9\u05DB\u05D5\u05E8\u05EA \u05E7\u05D5\u05D1\u05E2\u05EA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    parentMonthly: numberAfterLabel(text, "\u05E7\u05E6\u05D1\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA \u05DC\u05D4\u05D5\u05E8\u05D4 \u05E0\u05EA\u05DE\u05DA \u05D1\u05DE\u05E7\u05E8\u05D4 \u05DE\u05D5\u05D5\u05EA"),
    insuranceCostPctOfDeposits: pctAfterLabel(
      text,
      "\u05D0\u05D7\u05D5\u05D6 \u05DE\u05E1\u05DA \u05DB\u05DC \u05D4\u05D4\u05E4\u05E7\u05D3\u05D5\u05EA \u05E9\u05E9\u05D5\u05DC\u05DD \u05D1\u05E9\u05E0\u05EA \u05D4\u05D3\u05D5\u05D7 \u05E2\u05D1\u05D5\u05E8 \u05E8\u05DB\u05D9\u05E9\u05EA \u05DB\u05D9\u05E1\u05D5\u05D9 \u05D1\u05D9\u05D8\u05D5\u05D7\u05D9"
    )
  };
  return Object.values(coverages).some((v) => typeof v === "number") ? coverages : void 0;
}
function extractBalanceMovements(text) {
  const movements = {
    openingBalance: void 0,
    deposits: extractAnnualDeposits(text),
    transfersIn: void 0,
    transfersOut: void 0,
    investmentProfitLoss: void 0,
    managementFeesPaid: void 0,
    disabilityInsuranceCost: void 0,
    survivorsInsuranceCost: void 0,
    actuarialAdjustment: void 0,
    closingBalance: void 0
  };
  const valueOnLabelLine = (label, side = "before") => {
    const idx = text.indexOf(label);
    if (idx < 0) return void 0;
    const lineStart = text.lastIndexOf("\n", idx);
    const lineEnd = text.indexOf("\n", idx);
    const line = text.slice(lineStart >= 0 ? lineStart + 1 : 0, lineEnd >= 0 ? lineEnd : text.length);
    const part = side === "after" ? line.slice(line.indexOf(label) + label.length) : line.slice(0, line.indexOf(label));
    const nums = numbersInBlob(part);
    if (!nums.length) return void 0;
    return side === "after" ? nums[nums.length - 1] : nums[0];
  };
  movements.transfersIn = valueOnLabelLine("\u05DB\u05E1\u05E4\u05D9\u05DD \u05E9\u05D4\u05E2\u05D1\u05E8\u05EA \u05DC\u05D7\u05E9\u05D1\u05D5\u05DF", "after");
  movements.transfersOut = valueOnLabelLine("\u05DB\u05E1\u05E4\u05D9\u05DD \u05E9\u05D4\u05E2\u05D1\u05E8\u05EA \u05DE\u05D4\u05E7\u05E8\u05DF");
  movements.investmentProfitLoss = valueOnLabelLine("\u05E8\u05D5\u05D5\u05D7\u05D9\u05DD \u05D1\u05E0\u05D9\u05DB\u05D5\u05D9 \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA", "after") ?? valueOnLabelLine("\u05E8\u05D5\u05D5\u05D7\u05D9\u05DD \u05D1\u05E0\u05D9\u05DB\u05D5\u05D9 \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA");
  movements.managementFeesPaid = valueOnLabelLine("\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC \u05E9\u05E0\u05D2\u05D1\u05D5 \u05D1\u05E9\u05E0\u05D4 \u05D6\u05D5", "after") ?? valueOnLabelLine("\u05D3\u05DE\u05D9 \u05E0\u05D9\u05D4\u05D5\u05DC \u05E9\u05E0\u05D2\u05D1\u05D5 \u05D1\u05E9\u05E0\u05D4 \u05D6\u05D5");
  movements.disabilityInsuranceCost = valueOnLabelLine("\u05E2\u05DC\u05D5\u05EA \u05D4\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05E1\u05D9\u05DB\u05D5\u05E0\u05D9 \u05E0\u05DB\u05D5\u05EA", "after") ?? valueOnLabelLine("\u05E2\u05DC\u05D5\u05EA \u05D4\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05E1\u05D9\u05DB\u05D5\u05E0\u05D9 \u05E0\u05DB\u05D5\u05EA");
  movements.survivorsInsuranceCost = valueOnLabelLine("\u05E2\u05DC\u05D5\u05EA \u05D4\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05E9\u05D0\u05E8\u05D9\u05DD", "after") ?? valueOnLabelLine("\u05E2\u05DC\u05D5\u05EA \u05D4\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DC\u05E9\u05D0\u05E8\u05D9\u05DD");
  movements.actuarialAdjustment = valueOnLabelLine("\u05E2\u05D3\u05DB\u05D5\u05DF \u05D9\u05EA\u05E8\u05EA \u05D4\u05DB\u05E1\u05E4\u05D9\u05DD \u05D1\u05D2\u05D9\u05DF \u05D4\u05E4\u05E2\u05DC\u05EA \u05DE\u05E0\u05D2\u05E0\u05D5\u05DF \u05D0\u05D9\u05D6\u05D5\u05DF \u05D0\u05E7\u05D8\u05D5\u05D0\u05E8\u05D9", "after") ?? valueOnLabelLine("\u05E2\u05D3\u05DB\u05D5\u05DF \u05D9\u05EA\u05E8\u05EA \u05D4\u05DB\u05E1\u05E4\u05D9\u05DD \u05D1\u05D2\u05D9\u05DF \u05D4\u05E4\u05E2\u05DC\u05EA \u05DE\u05E0\u05D2\u05E0\u05D5\u05DF \u05D0\u05D9\u05D6\u05D5\u05DF \u05D0\u05E7\u05D8\u05D5\u05D0\u05E8\u05D9");
  movements.closingBalance = extractBalance(text, "");
  return Object.values(movements).some((v) => typeof v === "number") ? movements : void 0;
}
function extractInvestmentTracks(text, fallbackTrack) {
  const tracks = [];
  const balanceRow = text.match(/יתרת\s*חיסכון\s*מצטבר\s*31\.12\.25\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
  const returnRow = text.match(/שיעור\s*התשואה\s*ברוטו\*?\s*([\d.]+)%\s*([\d.]+)%/);
  const return5yRow = text.match(/שיעור\s*תשואה\s*מצטבר\s*ברוטו\s*בתקופה\s*של\s*5\s*שנים\s*([\d.]+)%\s*([\d.]+)%/);
  const feeDepositRow = text.match(/שיעור\s*דמי\s*ניהול\s*מהפקדה\s*([\d.]+)%\s*([\d.]+)%/);
  const feeBalanceRow = text.match(/שיעור\s*דמי\s*ניהול\s*מחיסכון\s*([\d.]+)%\s*([\d.]+)%/);
  const expenseRow = text.match(/שיעור\s*הוצאות\s*לניהול\s*השקעות\*?\s*([\d.]+)%\s*([\d.]+)%/);
  if (balanceRow) {
    tracks.push({
      name: "\u05DC\u05D1\u05E0\u05D9 50 \u05D5\u05DE\u05D8\u05D4 - \u05EA\u05DC\u05D5\u05D9 \u05D2\u05D9\u05DC",
      balance: parseAmount(balanceRow[1]),
      annualReturnPct: returnRow ? parseFloat(returnRow[1]) : void 0,
      return5yPct: return5yRow ? parseFloat(return5yRow[1]) : void 0,
      mgmtFeeDepositPct: feeDepositRow ? parseFloat(feeDepositRow[1]) : void 0,
      mgmtFeeBalancePct: feeBalanceRow ? parseFloat(feeBalanceRow[1]) : void 0,
      investmentExpensePct: expenseRow ? parseFloat(expenseRow[1]) : void 0
    });
    tracks.push({
      name: "\u05E2\u05D5\u05E7\u05D1 \u05DE\u05D3\u05D3 S&P500",
      balance: parseAmount(balanceRow[2]),
      annualReturnPct: returnRow ? parseFloat(returnRow[2]) : void 0,
      return5yPct: return5yRow ? parseFloat(return5yRow[2]) : void 0,
      mgmtFeeDepositPct: feeDepositRow ? parseFloat(feeDepositRow[2]) : void 0,
      mgmtFeeBalancePct: feeBalanceRow ? parseFloat(feeBalanceRow[2]) : void 0,
      investmentExpensePct: expenseRow ? parseFloat(expenseRow[2]) : void 0
    });
  }
  if (!tracks.length && fallbackTrack) {
    tracks.push({ name: fallbackTrack });
  }
  return tracks.length ? tracks : void 0;
}
function extractAnnualDeposits(text) {
  const idx = text.indexOf("\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA");
  if (idx >= 0) {
    const sub = text.slice(idx, idx + 4e3);
    const totalRow = sub.match(
      /([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*סה[״"']כ/
    );
    if (totalRow) {
      const nums = [1, 2, 3, 4].map((i) => parseAmount(totalRow[i]));
      return Math.max(...nums);
    }
  }
  const flowForward = text.match(
    /הפקדות\s*כספים\s*ל(?:קרן|חשבון)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/
  );
  if (flowForward) return parseAmount(flowForward[4]);
  const flow = text.match(/((?:-?\d{1,3}(?:,\d{3})*\.\d{2}){4})\s*הפקדות\s*כספים\s*ל(?:קרן|חשבון)/);
  if (flow) {
    const nums = numbersInBlob(flow[1]);
    if (nums.length) return nums[0];
  }
  return void 0;
}
function isSummaryFormat(text) {
  const isDetailed = /תנועות\s*ויתרות\s*כספים/.test(text) || /יתרת\s*החיסכון\s*המצטבר/.test(text);
  if (isDetailed) return false;
  const hasMovements = /תנועות\s*ב(?:חשבונך|קרן)/.test(text);
  const hasClosing = /יתרת\s*הכספים\s*ב(?:חשבון|קרן)\s*(?:בסוף|נכון\s*ל)/.test(text);
  return hasMovements && hasClosing;
}
function amountBeforeLabel(text, labelSource) {
  const m = text.match(new RegExp(`(-?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*${labelSource}`));
  return m ? parseAmount(m[1]) : void 0;
}
function amountBeforeAny(text, labels) {
  for (const l of labels) {
    const v = amountBeforeLabel(text, l);
    if (v !== void 0) return v;
  }
  return void 0;
}
function parseSummaryBlock(text, providerName, reportDate, isQuarterly, source) {
  const product = detectProduct(text);
  const customerId = text.match(/מספר\s*ת\.?ז\.?\s*:?\s*(\d{8,9})(?:\/\d)?/)?.[1] || text.match(/(\d{9})\s*מספר\s*ת\.?ז/)?.[1] || text.match(/מספר\s*תעודת\s*זהות\s*:?\s*(\d{9})/)?.[1];
  const customerName = cleanHebrewPdfText(
    text.match(/שם\s*העמית(?:\/ה)?\s*:?\s*([֐-׿][֐-׿\s'"-]{1,40}?)\s{2,}/)?.[1] || text.match(/מספר\s*ת\.?ז\.?\s*:?\s*[֐-׿\s'"-]{0,40}?([֐-׿][֐-׿\s'"-]{2,40}?)\s*שם\s*:/)?.[1]
  );
  let accountNumber = text.match(/(\d{6,12})\s*מספר\s*חשבון/)?.[1] || text.match(/מספר\s*חשבון\s*(?:העמית\/?ה?)?\s*:?\s*(\d{6,12})/)?.[1] || "";
  if (accountNumber && (accountNumber === customerId || new RegExp(`${accountNumber}\\s*\u05DE\u05E1\u05E4\u05E8\\s*(?:\u05EA\u05D9\u05E7|\u05EA\\.?\u05D6)`).test(text))) {
    accountNumber = "";
  }
  const balance = amountBeforeAny(text, [
    "\u05D9\u05EA\u05E8\u05EA\\s*\u05D4\u05DB\u05E1\u05E4\u05D9\u05DD\\s*\u05D1(?:\u05D7\u05E9\u05D1\u05D5\u05DF|\u05E7\u05E8\u05DF)\\s*\u05D1\u05E1\u05D5\u05E3",
    "\u05D9\u05EA\u05E8\u05EA\\s*\u05D4\u05DB\u05E1\u05E4\u05D9\u05DD\\s*\u05D1(?:\u05D7\u05E9\u05D1\u05D5\u05DF|\u05E7\u05E8\u05DF)\\s*\u05E0\u05DB\u05D5\u05DF\\s*\u05DC"
  ]) ?? 0;
  const openingBalance = amountBeforeLabel(
    text,
    "\u05D9\u05EA\u05E8\u05EA\\s*\u05D4\u05DB\u05E1\u05E4\u05D9\u05DD\\s*\u05D1(?:\u05D7\u05E9\u05D1\u05D5\u05DF|\u05E7\u05E8\u05DF)\\s*\u05D1\u05EA\u05D7\u05D9\u05DC\u05EA\\s*\u05D4\u05E9\u05E0\u05D4"
  );
  const deposits = amountBeforeLabel(text, "\u05DB\u05E1\u05E4\u05D9\u05DD\\s*\u05E9\u05D4\u05D5\u05E4\u05E7\u05D3\u05D5\\s*\u05DC(?:\u05D7\u05E9\u05D1\u05D5\u05DF|\u05E7\u05E8\u05DF)");
  const profitLoss = amountBeforeAny(text, [
    "\u05E8\u05D5\u05D5\u05D7\u05D9\u05DD\\s*\u05D1\u05E0\u05D9\u05DB\u05D5\u05D9\\s*\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA\\s*\u05E0\u05D9\u05D4\u05D5\u05DC\\s*\u05D4\u05E9\u05E7\u05E2\u05D5\u05EA",
    "\u05D4\u05E4\u05E1\u05D3\u05D9\u05DD\\s*\u05D1\u05E0\u05D9\u05DB\u05D5\u05D9\\s*\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA\\s*\u05E0\u05D9\u05D4\u05D5\u05DC\\s*\u05D4\u05E9\u05E7\u05E2\u05D5\u05EA"
  ]);
  const feesPaid = amountBeforeLabel(text, "\u05D3\u05DE\u05D9\\s*\u05E0\u05D9\u05D4\u05D5\u05DC\\s*\u05E9\u05E0\u05D2\u05D1\u05D5\\s*\u05D1\u05E9\u05E0\u05D4\\s*\u05D6\u05D5");
  const transfersOut = amountBeforeLabel(text, "\u05DB\u05E1\u05E4\u05D9\u05DD\\s*\u05E9\u05D4\u05E2\u05D1\u05E8\u05EA\\s*\u05DE\u05D4\u05E7\u05E8\u05DF");
  const mgmtFeeBalance = (() => {
    const m = text.match(/([\d.]+)\s*%\s*דמי\s*ניהול\s*מחיסכון/);
    return m ? parseFloat(m[1]) : void 0;
  })();
  const mgmtFeeDeposit = (() => {
    const m = text.match(/([\d.]+)\s*%\s*דמי\s*ניהול\s*מהפקדה/);
    return m ? parseFloat(m[1]) : void 0;
  })();
  let planName;
  let returnYear;
  const trackM = text.match(
    /ד\.\s*מסלולי\s*השקעה[\s\S]{0,120}?((?:-?[\d.]+\s*%\s*)+)([֐-׿][֐-׿\s'"\-]{2,40})/
  );
  if (trackM) {
    const pcts = trackM[1].match(/-?[\d.]+/g)?.map((n) => parseFloat(n)) ?? [];
    returnYear = pcts.length ? pcts[pcts.length - 1] : void 0;
    planName = cleanHebrewPdfText(trackM[2]);
  }
  const annualDeposits = deposits;
  const periodMonths = isQuarterly ? 3 : 12;
  const monthlyContrib = annualDeposits ? +(annualDeposits / periodMonths).toFixed(2) : void 0;
  const balanceMovements = {
    openingBalance,
    deposits,
    investmentProfitLoss: profitLoss,
    transfersOut: transfersOut !== void 0 ? Math.abs(transfersOut) : void 0,
    managementFeesPaid: feesPaid !== void 0 ? Math.abs(feesPaid) : void 0,
    closingBalance: balance || void 0
  };
  const hasMovements = Object.values(balanceMovements).some((v) => typeof v === "number");
  if (!accountNumber && !balance && !hasMovements) return null;
  const periodWord = isQuarterly ? "\u05E8\u05D1\u05E2\u05D5\u05E0\u05D9" : "\u05E9\u05E0\u05EA\u05D9";
  const notes = [
    `\u05D3\u05D5\u05D7 ${periodWord} \u05DE\u05EA\u05D5\u05DE\u05E6\u05EA (${providerName}) \u2014 \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05E2\u05D5\u05D2\u05DC\u05D9\u05DD \u05DC\u05E9\u05E7\u05DC${isQuarterly ? "; \u05D4\u05E4\u05E7\u05D3\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA \u05D7\u05D5\u05E9\u05D1\u05D4 \u05DC\u05E4\u05D9 \u05D4\u05E8\u05D1\u05E2\u05D5\u05DF" : ""}`
  ];
  if (source !== "pdf") notes.push("\u05D7\u05D5\u05DC\u05E5 \u05DE\u05E7\u05D5\u05D1\u05E5 \u05D8\u05D1\u05DC\u05D0\u05D9/\u05D8\u05E7\u05E1\u05D8\u05D5\u05D0\u05DC\u05D9 \u2014 \u05DE\u05D5\u05DE\u05DC\u05E5 \u05DC\u05D0\u05DE\u05EA \u05DE\u05D5\u05DC \u05DE\u05E1\u05DE\u05DA \u05D4\u05DE\u05E7\u05D5\u05E8");
  const stableKey = accountNumber || (customerId ? `${customerId}_${product.type}` : Math.random().toString(36).slice(2, 8));
  return {
    id: `pdf_${providerName}_${stableKey}`,
    accountNumber,
    providerName,
    productType: product.type,
    productTypeLabel: product.label,
    planName: planName || product.label,
    customerName,
    customerId,
    liquidityDate: extractLiquidityDate(text),
    balance,
    reportDate,
    annualDeposits,
    monthlyContrib,
    mgmtFeeBalance,
    mgmtFeeDeposit,
    returnYear,
    status: "active",
    annualContributionsBreakdown: annualDeposits ? { employee: annualDeposits, total: annualDeposits } : void 0,
    balanceMovements: hasMovements ? balanceMovements : void 0,
    investmentTracks: planName ? [
      {
        name: planName,
        annualReturnPct: returnYear,
        mgmtFeeBalancePct: mgmtFeeBalance,
        mgmtFeeDepositPct: mgmtFeeDeposit
      }
    ] : void 0,
    notes
  };
}
function parseSummaryReport(text, filename, pages, source) {
  const warnings = [];
  const providerName = detectProvider(text);
  const isQuarterly = /רבעוני/.test(text);
  const reportDate = parseDate(
    text.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s*:?\s*תאריך\s*הדוח/)?.[1] || text.match(/תאריך\s*הדוח\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/)?.[1]
  );
  const LOOKBACK = 260;
  const aStarts = [...text.matchAll(/א\.\s*תשלומים\s*צפויים/g)].map((m) => m.index ?? 0);
  let blocks;
  if (aStarts.length <= 1) {
    blocks = [text];
  } else {
    const bounds = aStarts.map((idx, i) => i === 0 ? 0 : Math.max(0, idx - LOOKBACK));
    blocks = bounds.map(
      (start, i) => text.slice(start, i + 1 < bounds.length ? bounds[i + 1] : text.length)
    );
  }
  const policies = blocks.map((b) => parseSummaryBlock(b, providerName, reportDate, isQuarterly, source)).filter((p) => p !== null);
  if (!policies.length) {
    warnings.push("\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D4 \u05D9\u05EA\u05E8\u05EA \u05D7\u05D9\u05E1\u05DB\u05D5\u05DF \u05D1\u05D3\u05D5\u05D7");
    return { filename, pages, policies: [], warnings };
  }
  return { filename, pages, policies, warnings };
}
function parseAnnualReportText(text, filename, pages, source) {
  const warnings = [];
  if (!text.trim()) {
    warnings.push(source === "pdf" ? "PDF \u05E8\u05D9\u05E7 \u05D0\u05D5 \u05DC\u05D0 \u05E0\u05E7\u05E8\u05D0" : "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05E8\u05D9\u05E7 \u05D0\u05D5 \u05DC\u05D0 \u05E0\u05E7\u05E8\u05D0");
    return { filename, pages, policies: [], warnings };
  }
  if (/דוח\s+(?:יתרות\s+כספי|סכום\s+צבירה|סכום\s+צבירה\s+לחלוקת|סכום\s+צבירה\s+מזערי)/.test(text) || /לצרכי\s+מס\s+הכנסה|חלוקת\s+חיסכון\s+פנסיוני\s+בין\s+בני\s+זוג/.test(text)) {
    warnings.push("\u05DE\u05E1\u05DE\u05DA \u05E2\u05D6\u05E8 \u05E9\u05DC \u05DE\u05E1\u05DC\u05E7\u05D4 \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05EA \u05E0\u05E9\u05DE\u05E8 \u05DB\u05EA\u05D9\u05E2\u05D5\u05D3, \u05D0\u05DA \u05D0\u05D9\u05E0\u05D5 \u05DE\u05E7\u05D5\u05E8 \u05DC\u05D8\u05E2\u05D9\u05E0\u05EA \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05D9\u05DD");
    return { filename, pages, policies: [], warnings };
  }
  if (isSummaryFormat(text)) {
    return parseSummaryReport(text, filename, pages, source);
  }
  const providerName = detectProvider(text);
  const product = detectProduct(text);
  const reportDate = extractReportDate(text);
  const customer = extractCustomer(text);
  const allAccountMatches = [
    ...text.matchAll(/(\d{6,12})\s*מספר\s*חשבון\s*העמית/g),
    ...text.matchAll(/מספר\s*חשבון\s*העמית[\s\/ה]*(\d{6,12})/g)
  ];
  const uniqueAccounts = Array.from(new Set(allAccountMatches.map((m) => m[1])));
  const accountNumber = extractAccountNumber(text) || uniqueAccounts[0] || "";
  const employer = extractEmployer(text);
  const joinDate = extractJoinDate(text);
  const planName = extractPlanName(text);
  const fees = extractMgmtFees(text);
  const returns = extractReturns(text);
  const pensionProj = extractProjectedPension(text);
  const salaryBase = extractSalaryBase(text);
  const annualDeposits = extractAnnualDeposits(text);
  const balance = extractBalance(text, reportDate);
  const annualContributionsBreakdown = extractAnnualContributionsBreakdown(text);
  const projectedCoverages = extractProjectedCoverages(text);
  const balanceMovements = extractBalanceMovements(text);
  const status = extractStatus(text);
  const annualDepositsTotal = annualContributionsBreakdown?.total ?? annualDeposits;
  const monthlyContrib = annualDepositsTotal ? +(annualDepositsTotal / 12).toFixed(2) : void 0;
  const notes = [];
  if (source !== "pdf") {
    notes.push("\u05D7\u05D5\u05DC\u05E5 \u05DE\u05E7\u05D5\u05D1\u05E5 \u05D8\u05D1\u05DC\u05D0\u05D9/\u05D8\u05E7\u05E1\u05D8\u05D5\u05D0\u05DC\u05D9 \u2014 \u05DE\u05D5\u05DE\u05DC\u05E5 \u05DC\u05D0\u05DE\u05EA \u05DE\u05D5\u05DC \u05DE\u05E1\u05DE\u05DA \u05D4\u05DE\u05E7\u05D5\u05E8");
  }
  if (uniqueAccounts.length > 1) {
    notes.push(
      `${uniqueAccounts.length} \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05D1\u05E7\u05D5\u05D1\u05E5 \u2014 \u05D4\u05D9\u05EA\u05E8\u05D4 \u05D4\u05D9\u05D0 \u05D4\u05E1\u05DB\u05D5\u05DD \u05D4\u05DB\u05D5\u05DC\u05DC. \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA: ${uniqueAccounts.join(", ")}`
    );
  }
  const policy = {
    id: `pdf_${providerName}_${accountNumber || Math.random().toString(36).slice(2, 8)}`,
    accountNumber,
    providerName,
    productType: product.type,
    productTypeLabel: product.label,
    planName: planName || product.label,
    customerName: customer.name,
    customerId: customer.id,
    employerName: employer,
    joinDate,
    liquidityDate: extractLiquidityDate(text),
    balance,
    reportDate,
    annualDeposits: annualDepositsTotal,
    monthlyContrib,
    mgmtFeeBalance: fees.balance,
    mgmtFeeDeposit: fees.deposit,
    returnYear: returns.year,
    return5y: returns.fiveY,
    projectedPensionAmount: pensionProj.amount,
    retirementAge: pensionProj.retireAge,
    salaryBase,
    status,
    annualContributionsBreakdown,
    projectedCoverages,
    balanceMovements,
    investmentTracks: extractInvestmentTracks(text, planName),
    notes: notes.length ? notes : void 0
  };
  if (!balance && balanceMovements?.closingBalance === void 0) {
    warnings.push("\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D4 \u05D9\u05EA\u05E8\u05EA \u05D7\u05D9\u05E1\u05DB\u05D5\u05DF \u05D1\u05D3\u05D5\u05D7");
  }
  if (!providerName || providerName === "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4") warnings.push("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4 \u05D9\u05E6\u05E8\u05DF \u05D4\u05E7\u05D5\u05E4\u05D4");
  if (!product.type || product.type === "unknown") warnings.push("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4 \u05E1\u05D5\u05D2 \u05DE\u05D5\u05E6\u05E8");
  return { filename, pages, policies: [policy], warnings };
}
async function parseAnnualReportPdf(buffer, filename, password) {
  try {
    const data = await pdfParse2(buffer, password ? { password } : void 0);
    return parseAnnualReportText(data.text || "", filename, data.numpages || 0, "pdf");
  } catch (e) {
    return {
      filename,
      pages: 0,
      policies: [],
      warnings: [`\u05DB\u05E9\u05DC \u05D1\u05E7\u05E8\u05D9\u05D0\u05EA PDF: ${e instanceof Error ? e.message : String(e)}`]
    };
  }
}
function worksheetToSearchText(sheet) {
  const rows = XLSX2.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false
  });
  return rows.map(
    (row) => row.filter((cell) => cell !== null && cell !== void 0 && String(cell).trim() !== "").join(" ")
  ).filter(Boolean).join("\n");
}
async function parseAnnualReportSpreadsheet(buffer, filename) {
  try {
    const workbook = XLSX2.read(buffer, { type: "buffer", cellDates: false });
    const sheetTexts = workbook.SheetNames.map((name) => {
      const text2 = worksheetToSearchText(workbook.Sheets[name]);
      return text2 ? `\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF ${name}
${text2}` : "";
    }).filter(Boolean);
    const text = sheetTexts.join("\n\n");
    return parseAnnualReportText(text, filename, workbook.SheetNames.length, "spreadsheet");
  } catch (e) {
    return {
      filename,
      pages: 0,
      policies: [],
      warnings: [`\u05DB\u05E9\u05DC \u05D1\u05E7\u05E8\u05D9\u05D0\u05EA Excel: ${e instanceof Error ? e.message : String(e)}`]
    };
  }
}
async function parseAnnualReportTextFile(buffer, filename) {
  const text = buffer.toString("utf8");
  return parseAnnualReportText(text, filename, 1, "text");
}
async function parseAnnualReportBundle(files, password) {
  const parsed = [];
  const allWarnings = [];
  for (const f of files) {
    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      const r = ext === "xlsx" || ext === "xls" ? await parseAnnualReportSpreadsheet(f.buffer, f.name) : ext === "csv" || ext === "txt" ? await parseAnnualReportTextFile(f.buffer, f.name) : await parseAnnualReportPdf(f.buffer, f.name, password);
      parsed.push(r);
      allWarnings.push(...r.warnings.map((w) => `[${f.name}] ${w}`));
    } catch (e) {
      allWarnings.push(`[${f.name}] \u05DB\u05E9\u05DC \u05D2\u05D5\u05E8\u05E3: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const rawPolicies = parsed.flatMap((f) => f.policies);
  const byId = /* @__PURE__ */ new Map();
  for (const p of rawPolicies) {
    const existing = byId.get(p.id);
    if (!existing || (p.reportDate || "") > (existing.reportDate || "")) {
      byId.set(p.id, p);
    }
  }
  const policies = Array.from(byId.values());
  if (rawPolicies.length > policies.length) {
    allWarnings.push(
      `\u05D0\u05D5\u05D7\u05D3\u05D5 ${rawPolicies.length - policies.length} \u05D3\u05D5\u05D7\u05D5\u05EA \u05DB\u05E4\u05D5\u05DC\u05D9\u05DD (\u05D0\u05D5\u05EA\u05D5 \u05D7\u05E9\u05D1\u05D5\u05DF) \u2014 \u05E0\u05E9\u05DE\u05E8 \u05D4\u05D3\u05D5\u05D7 \u05D4\u05E2\u05D3\u05DB\u05E0\u05D9 \u05D1\u05D9\u05D5\u05EA\u05E8`
    );
  }
  const totalBalance = policies.reduce((s, p) => s + p.balance, 0);
  const totalProjectedPension = policies.reduce((s, p) => s + (p.projectedPensionAmount ?? 0), 0);
  const totalMonthlyContrib = policies.reduce((s, p) => s + (p.monthlyContrib ?? 0), 0);
  const byType = {
    pension_comprehensive: [],
    pension_general: [],
    insurance_manager: [],
    gemel: [],
    hishtalmut: [],
    gemel_investment: [],
    unknown: []
  };
  for (const p of policies) byType[p.productType].push(p);
  const customerName = policies.find((p) => p.customerName)?.customerName;
  const customerId = policies.find((p) => p.customerId)?.customerId;
  return {
    files: parsed,
    policies,
    totalBalance,
    totalProjectedPension,
    totalMonthlyContrib,
    byType,
    warnings: allWarnings,
    customerName,
    customerId
  };
}

// ../lib/doc-parser/maslaka-pdf-parser.ts
import pdfParse3 from "pdf-parse";
function extractAmounts3(text) {
  const matches = text.match(/₪\s*[\d,]+(?:\.\d{2})?/g);
  if (!matches) return [];
  return matches.map((m) => {
    const cleaned = m.replace(/[₪\s,]/g, "");
    return parseFloat(cleaned) || 0;
  });
}
function parsePct(s) {
  const m = s.match(/([\d.]+)%/);
  return m ? parseFloat(m[1]) : 0;
}
function parseDate2(s) {
  const full = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (full) return `${full[3]}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
  const my = s.match(/(\d{1,2})\/(\d{4})/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}-01`;
  return s;
}
function normalizeProductType(typeStr) {
  const lower = typeStr.toLowerCase();
  if (typeStr.includes("\u05E4\u05E0\u05E1\u05D9\u05D4")) return "pension";
  if (typeStr.includes("\u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA")) return "hishtalmut";
  if (typeStr.includes("\u05D2\u05DE\u05DC")) return "gemel";
  if (typeStr.includes("\u05E8\u05D9\u05E1\u05E7") || typeStr.includes("\u05E1\u05D9\u05DB\u05D5\u05DF \u05D8\u05D4\u05D5\u05E8")) return "insurance_risk";
  if (typeStr.includes("\u05DE\u05E9\u05DB\u05E0\u05EA\u05D0")) return "insurance_mortgage";
  if (typeStr.includes("\u05D1\u05D9\u05D8\u05D5\u05D7")) return "bituach";
  return "gemel";
}
function splitIntoSections(fullText) {
  const sections = [];
  const sectionHeaders = [
    "\u05E7\u05E8\u05E0\u05D5\u05EA \u05E4\u05E0\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D5\u05EA",
    "\u05E7\u05E8\u05E0\u05D5\u05EA \u05E4\u05E0\u05E1\u05D9\u05D4 \u05D5\u05EA\u05D9\u05E7\u05D5\u05EA",
    "\u05E7\u05E8\u05E0\u05D5\u05EA \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA",
    "\u05E7\u05D5\u05E4\u05D5\u05EA \u05D2\u05DE\u05DC",
    "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05DE\u05E0\u05D4\u05DC\u05D9\u05DD",
    "\u05D7\u05D1\u05E8\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u2013 \u05E4\u05D5\u05DC\u05D9\u05E1\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u05E8\u05D9\u05E1\u05E7 \u05D8\u05D4\u05D5\u05E8",
    "\u05D7\u05D1\u05E8\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 - \u05E4\u05D5\u05DC\u05D9\u05E1\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u05E8\u05D9\u05E1\u05E7 \u05D8\u05D4\u05D5\u05E8",
    "\u05D7\u05D1\u05E8\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 - \u05E4\u05D5\u05DC\u05D9\u05E1\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u05D7\u05D9\u05D9\u05DD \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0",
    "\u05D7\u05D1\u05E8\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u2013 \u05E4\u05D5\u05DC\u05D9\u05E1\u05D5\u05EA \u05D1\u05D9\u05D8\u05D5\u05D7 \u05D7\u05D9\u05D9\u05DD \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0",
    "\u05D2\u05DE\u05DC \u05DC\u05D4\u05E9\u05E7\u05E2\u05D4"
  ];
  for (const header of sectionHeaders) {
    let searchFrom = 0;
    let bestIdx = -1;
    while (true) {
      const idx = fullText.indexOf(header, searchFrom);
      if (idx < 0) break;
      const after = fullText.substring(idx, idx + 300);
      if (after.includes("\u05E9\u05DD \u05D7\u05D1\u05E8\u05D4 \u05DE\u05E0\u05D4\u05DC\u05EA") || after.includes("\u05E1\u05D5\u05D2 \u05DE\u05D5\u05E6\u05E8 \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9") || after.includes("\u05DE\u05E1\u05E4\u05E8 \u05E4\u05D5\u05DC\u05D9\u05E1\u05D4")) {
        bestIdx = idx;
        break;
      }
      searchFrom = idx + header.length;
    }
    if (bestIdx < 0) continue;
    let endIdx = fullText.length;
    for (const otherHeader of sectionHeaders) {
      if (otherHeader === header) continue;
      let otherSearchFrom = bestIdx + header.length;
      while (true) {
        const otherIdx = fullText.indexOf(otherHeader, otherSearchFrom);
        if (otherIdx < 0 || otherIdx >= endIdx) break;
        const charBefore = otherIdx > 0 ? fullText[otherIdx - 1] : "\n";
        if (charBefore === "\n") {
          endIdx = otherIdx;
          break;
        }
        otherSearchFrom = otherIdx + otherHeader.length;
      }
    }
    for (const boundary of ["\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA", "\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05EA\u05D5\u05DB\u05E0\u05D9\u05D5\u05EA"]) {
      const bIdx = fullText.indexOf(boundary, bestIdx + header.length);
      if (bIdx > 0 && bIdx < endIdx) endIdx = bIdx;
    }
    sections.push({
      sectionType: header,
      text: fullText.substring(bestIdx, endIdx)
    });
  }
  return sections;
}
function parseProductSection(section) {
  const { sectionType, text } = section;
  const products = [];
  const companyLine = text.match(/שם חברה מנהלת([\s\S]*?)סוג מוצר פנסיוני/);
  if (!companyLine) {
    return products;
  }
  const companyText = companyLine[1].trim();
  const typeLine = text.match(/סוג מוצר פנסיוני([\s\S]*?)מספר פוליסה/);
  const typeText = typeLine?.[1]?.trim() || "";
  const policyLine = text.match(/מספר פוליסה([\s\S]*?)סטטוס/);
  const policyText = policyLine?.[1]?.trim() || "";
  const statusLine = text.match(/סטטוס([\s\S]*?)(?:\*?\s*סה["״'"]כ חיסכון|סכום ביטוח)/);
  const statusText = statusLine?.[1]?.trim() || "";
  const rawMatches = policyText.match(/\d{6,}/g) || [];
  const policyNumbers = [];
  for (const raw of rawMatches) {
    if (raw.length <= 12) {
      policyNumbers.push(raw);
    } else {
      let split = false;
      let bestSplit = null;
      let bestScore = Infinity;
      const TYPICAL_LEN = 9.5;
      for (let splitAt = 6; splitAt <= raw.length - 6; splitAt++) {
        const left = raw.substring(0, splitAt);
        const right = raw.substring(splitAt);
        if (left.length < 6 || left.length > 12 || right.length < 6 || right.length > 12) continue;
        const zeroPenalty = (left.startsWith("0") ? 10 : 0) + (right.startsWith("0") ? 10 : 0);
        const score = Math.abs(left.length - TYPICAL_LEN) + Math.abs(right.length - TYPICAL_LEN) + zeroPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestSplit = [left, right];
        }
      }
      if (bestSplit) {
        policyNumbers.push(...bestSplit);
        split = true;
      }
      if (!split) policyNumbers.push(raw);
    }
  }
  const numProducts = policyNumbers.length;
  if (numProducts === 0) return products;
  if (numProducts === 1) {
    const product = extractSingleProduct(
      text,
      sectionType,
      companyText,
      typeText,
      policyNumbers[0],
      statusText
    );
    if (product) products.push(product);
  } else {
    const balanceLine = text.match(/\*?\s*סה["״'"]כ חיסכון צבור([\s\S]*?)(?:חיסכון צפוי|מועד)/);
    const balanceAmounts = balanceLine ? extractAmounts3(balanceLine[1]) : [];
    const companies = splitCompanyNames(companyText, numProducts);
    for (let i = 0; i < numProducts; i++) {
      const product = extractSingleProduct(
        text,
        sectionType,
        companies[i] || companyText,
        typeText,
        policyNumbers[i],
        statusText,
        i,
        numProducts,
        balanceAmounts
      );
      if (product) products.push(product);
    }
  }
  return products;
}
function splitCompanyNames(text, count) {
  const knownCompanies = [
    "\u05DE\u05D2\u05D3\u05DC",
    "\u05D4\u05E4\u05E0\u05D9\u05E7\u05E1",
    "\u05DE\u05E0\u05D5\u05E8\u05D4",
    "\u05D4\u05E8\u05D0\u05DC",
    "\u05DB\u05DC\u05DC",
    "\u05DE\u05D9\u05D8\u05D1",
    "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8",
    "\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8",
    "\u05D9\u05DC\u05D9\u05DF",
    "\u05E4\u05E1\u05D2\u05D5\u05EA",
    "\u05DE\u05D5\u05E8",
    "\u05D0\u05D9\u05E0\u05E4\u05D9\u05E0\u05D9\u05D8\u05D9"
  ];
  if (count === 1) return [text];
  const found = [];
  for (const co of knownCompanies) {
    const idx = text.indexOf(co);
    if (idx >= 0) {
      let endIdx = text.length;
      for (const other of knownCompanies) {
        if (other === co) continue;
        const otherIdx = text.indexOf(other, idx + co.length);
        if (otherIdx > 0 && otherIdx < endIdx) endIdx = otherIdx;
      }
      found.push({ name: text.substring(idx, endIdx).trim(), idx });
    }
  }
  found.sort((a, b) => a.idx - b.idx);
  if (found.length >= count) {
    return found.slice(0, count).map((f) => f.name);
  }
  return Array(count).fill(text);
}
function extractSingleProduct(sectionText, sectionType, company, productTypeText, policyNumber, statusText, colIndex = 0, totalCols = 1, preExtractedBalances) {
  company = company.replace(/בע["\u05F4]?מ|בעמ/g, "").trim();
  let productType = productTypeText;
  if (sectionType.includes("\u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA")) productType = "\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA";
  else if (sectionType.includes("\u05E4\u05E0\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D5\u05EA")) productType = "\u05E4\u05E0\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05DE\u05E7\u05D9\u05E4\u05D4";
  else if (sectionType.includes("\u05E8\u05D9\u05E1\u05E7")) productType = "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05E8\u05D9\u05E1\u05E7";
  else if (sectionType.includes("\u05DE\u05E9\u05DB\u05E0\u05EA\u05D0")) productType = "\u05D1\u05D9\u05D8\u05D5\u05D7 \u05D7\u05D9\u05D9\u05DD \u05DE\u05E9\u05DB\u05E0\u05EA\u05D0";
  const isActive = !statusText.includes("\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC") || totalCols > 1 && colIndex === 0 && !statusText.startsWith("\u05DC\u05D0");
  let status = "active";
  if (totalCols === 1) {
    status = statusText.includes("\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC") ? "inactive" : "active";
  } else {
    const statusParts = statusText.split(/(פעיל|לא פעיל)/g).filter(Boolean);
    const colStatuses = [];
    for (let i = 0; i < statusParts.length; i++) {
      if (statusParts[i] === "\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC") colStatuses.push("inactive");
      else if (statusParts[i] === "\u05E4\u05E2\u05D9\u05DC") colStatuses.push("active");
    }
    status = colStatuses[colIndex] === "inactive" ? "inactive" : "active";
  }
  let balance = 0;
  if (preExtractedBalances && preExtractedBalances[colIndex] !== void 0) {
    balance = preExtractedBalances[colIndex];
  } else {
    const balMatch = sectionText.match(/סה["״'"]כ חיסכון צבור([\s\S]*?)(?:חיסכון צפוי|מועד|שיעור)/);
    if (balMatch) {
      const amounts = extractAmounts3(balMatch[1]);
      balance = amounts[colIndex] || amounts[0] || 0;
    }
  }
  let projectedNoDeposits;
  let projectedWithDeposits;
  const projNoMatch = sectionText.match(/חיסכון צפוי.*ללא ה(?:פקדות|משך)([\s\S]*?)חיסכון צפוי.*עם/);
  if (projNoMatch) {
    const amounts = extractAmounts3(projNoMatch[1]);
    projectedNoDeposits = amounts[colIndex] ?? amounts[0];
  }
  const projWithMatch = sectionText.match(/חיסכון צפוי.*עם המשך([\s\S]*?)(?:קיצבה|מועד|שיעור)/);
  if (projWithMatch) {
    const amounts = extractAmounts3(projWithMatch[1]);
    projectedWithDeposits = amounts[colIndex] ?? amounts[0];
  }
  let monthlyPensionNoDeposits;
  let monthlyPensionWithDeposits;
  const pensionNoMatch = sectionText.match(
    /קיצבה חודשית.*ללא ה(?:פקדות|משך)([\s\S]*?)קיצבה חודשית.*עם/
  );
  if (pensionNoMatch) {
    const amounts = extractAmounts3(pensionNoMatch[1]);
    monthlyPensionNoDeposits = amounts[colIndex] ?? amounts[0];
  }
  const pensionWithMatch = sectionText.match(
    /קיצבה חודשית.*עם המשך([\s\S]*?)(?:שיעור|תשואה|הפקדה)/
  );
  if (pensionWithMatch) {
    const amounts = extractAmounts3(pensionWithMatch[1]);
    monthlyPensionWithDeposits = amounts[colIndex] ?? amounts[0];
  }
  let mgmtFeeDeposit;
  let mgmtFeeBalance;
  const feeDepositMatch = sectionText.match(
    /שיעור דמי ניהול מהפקדות([\s\S]*?)שיעור דמי ניהול.*מחיסכון/
  );
  if (feeDepositMatch) {
    const pcts = feeDepositMatch[1].match(/[\d.]+%/g);
    if (pcts && pcts[colIndex]) mgmtFeeDeposit = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) mgmtFeeDeposit = parsePct(pcts[0]);
  }
  const feeBalMatch = sectionText.match(
    /שיעור דמי ניהול.*מחיסכון צבור([\s\S]*?)(?:תשואה|הפקדה|מסלול)/
  );
  if (feeBalMatch) {
    const pcts = feeBalMatch[1].match(/[\d.]+%/g);
    if (pcts && pcts[colIndex]) mgmtFeeBalance = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) mgmtFeeBalance = parsePct(pcts[0]);
  }
  let returnYtd;
  const returnMatch = sectionText.match(/תשואה מתחילת השנה([\s\S]*?)(?:הפקדה|מסלול|תאריך)/);
  if (returnMatch) {
    const pcts = returnMatch[1].match(/-?[\d.]+%/g);
    if (pcts && pcts[colIndex]) returnYtd = parsePct(pcts[colIndex]);
    else if (pcts && pcts[0]) returnYtd = parsePct(pcts[0]);
  }
  let lastDepositEmployee;
  let lastDepositEmployer;
  const empMatch = sectionText.match(/הפקדה חודשית אחרונה - חוסך([\s\S]*?)הפקדה חודשית.*מעסיק/);
  if (empMatch) {
    const amounts = extractAmounts3(empMatch[1]);
    lastDepositEmployee = amounts[colIndex] ?? amounts[0];
  }
  const employerMatch = sectionText.match(
    /הפקדה חודשית אחרונה - מעסיק([\s\S]*?)(?:מסלול|תאריך|קיים)/
  );
  if (employerMatch) {
    const amounts = extractAmounts3(employerMatch[1]);
    lastDepositEmployer = amounts[colIndex] ?? amounts[0];
  }
  let openingDate;
  const openMatch = sectionText.match(/תאריך פתיחת תכנית(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (openMatch) openingDate = parseDate2(openMatch[1]);
  let firstJoinDate;
  const joinMatch = sectionText.match(/תאריך הצטרפות לראשונה(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (joinMatch) firstJoinDate = parseDate2(joinMatch[1]);
  let liquidityDate;
  const liqMatch = sectionText.match(/מועד זכאות למשיכה בהטבת מס(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (liqMatch) liquidityDate = parseDate2(liqMatch[1]);
  let insurancePlan;
  const insMatch = sectionText.match(/מסלול ביטוח בקרן פנסיה\n([\s\S]*?)(?:פנסיית שארים|תאריך)/);
  if (insMatch) insurancePlan = insMatch[1].trim().substring(0, 100);
  let pensionSurvivorsSpouse;
  let pensionSurvivorsChildren;
  let pensionDisability;
  const sSpouse = sectionText.match(/פנסיית שארים - בן\/בת זוג([\s\S]*?)פנסיית שארים - ילדים/);
  if (sSpouse) {
    const amounts = extractAmounts3(sSpouse[1]);
    pensionSurvivorsSpouse = amounts[colIndex] ?? amounts[0];
  }
  const sChildren = sectionText.match(/פנסיית שארים - ילדים([\s\S]*?)פנסיית נכות/);
  if (sChildren) {
    const amounts = extractAmounts3(sChildren[1]);
    pensionSurvivorsChildren = amounts[colIndex] ?? amounts[0];
  }
  const sDisability = sectionText.match(/פנסיית נכות([\s\S]*?)(?:תאריך|מסלול)/);
  if (sDisability) {
    const amounts = extractAmounts3(sDisability[1]);
    pensionDisability = amounts[colIndex] ?? amounts[0];
  }
  let deathBenefitLumpSum;
  let premium;
  let insuranceEndDate;
  const deathMatch = sectionText.match(
    /סכום ביטוח למקרה מוות – חד פעמי([\s\S]*?)(?:סכום ביטוח אובדן|תאריך)/
  );
  if (deathMatch) {
    const amounts = extractAmounts3(deathMatch[1]);
    deathBenefitLumpSum = amounts[0];
  }
  const premiumMatch = sectionText.match(/פרמיה\)חודשי\)\s*([\d.]+)/);
  if (premiumMatch) premium = parseFloat(premiumMatch[1]);
  const endMatch = sectionText.match(/תאריך תום הכיסוי הביטוחי(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (endMatch) insuranceEndDate = parseDate2(endMatch[1]);
  return {
    company,
    productType,
    policyNumber,
    status,
    balance,
    projectedNoDeposits,
    projectedWithDeposits,
    monthlyPensionNoDeposits,
    monthlyPensionWithDeposits,
    mgmtFeeDeposit,
    mgmtFeeBalance,
    returnYtd,
    lastDepositEmployee,
    lastDepositEmployer,
    openingDate,
    liquidityDate,
    firstJoinDate,
    insurancePlan,
    pensionSurvivorsSpouse,
    pensionSurvivorsChildren,
    pensionDisability,
    deathBenefitLumpSum,
    premium,
    insuranceEndDate
  };
}
function parseDepositsSection(text) {
  const records = [];
  const headerPattern = /(\d{6,12})\s*מספר פוליסה:\s*\|\s*שם חברה מנהלת\s*:\s*(.*?)\|סוג המוצר:\s*(.*?)(?:\n|$)/g;
  let match;
  const headers = [];
  while ((match = headerPattern.exec(text)) !== null) {
    headers.push({
      idx: match.index,
      policy: match[1],
      company: match[2].trim().replace(/בע["\u05F4]?מ|בעמ/g, "").trim(),
      type: match[3].trim()
    });
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const endIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length;
    const sectionText = text.substring(h.idx, endIdx);
    const empMatch = sectionText.match(/שם המעסיק:\s*(.*?)(?:\n|$)/);
    const employer = empMatch?.[1]?.trim().replace(/בע["\u05F4]?מ|בעמ/g, "").trim() || "";
    records.push({
      policyNumber: h.policy,
      company: h.company,
      productType: h.type,
      employer,
      deposits: []
      // Could parse individual rows but not needed for now
    });
  }
  return records;
}
async function parseMaslakaPdf(buffer, filename, password) {
  const warnings = [];
  let text = "";
  try {
    const data = await pdfParse3(buffer, password ? { password } : void 0);
    text = data.text || "";
  } catch (e) {
    warnings.push(`\u05DB\u05E9\u05DC \u05D1\u05E7\u05E8\u05D9\u05D0\u05EA PDF: ${e instanceof Error ? e.message : String(e)}`);
    return { products: [], warnings };
  }
  if (!text.trim()) {
    warnings.push(`${filename}: PDF \u05E8\u05D9\u05E7`);
    return { products: [], warnings };
  }
  const isMaslaka = text.includes("\u05D3\u05D5\u05D7 \u05E8\u05D9\u05DB\u05D5\u05D6 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05DD") || text.includes("\u05DE\u05E1\u05DC\u05E7\u05D4 \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05EA");
  if (!isMaslaka) {
    warnings.push(`${filename}: \u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4 \u05DB\u05D3\u05D5\u05D7 \u05DE\u05E1\u05DC\u05E7\u05D4 \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05EA`);
    return { products: [], warnings };
  }
  let ownerName;
  let ownerId;
  const nameMatch = text.match(/([\u0590-\u05FF]+)שם פרטי:([\u0590-\u05FF]+)שם משפחה:(\d+)מס מזהה/);
  if (nameMatch) {
    ownerName = `${nameMatch[1]} ${nameMatch[2]}`.trim();
    ownerId = nameMatch[3];
  }
  let reportDate;
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})תאריך נכונות המידע/);
  if (dateMatch) reportDate = parseDate2(dateMatch[1]);
  const sections = splitIntoSections(text);
  const products = [];
  for (const section of sections) {
    try {
      const sectionProducts = parseProductSection(section);
      products.push(...sectionProducts);
    } catch (e) {
      warnings.push(
        `\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E4\u05E2\u05E0\u05D5\u05D7 \u05E1\u05E7\u05E9\u05DF ${section.sectionType}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  const depositsIdx = text.indexOf("\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D4\u05E4\u05E7\u05D3\u05D5\u05EA");
  if (depositsIdx > 0) {
    const depositsText = text.substring(depositsIdx);
    const depositRecords = parseDepositsSection(depositsText);
    for (const dr of depositRecords) {
      const product = products.find((p) => p.policyNumber === dr.policyNumber);
      if (product && dr.employer) {
        product.employer = dr.employer;
      }
    }
  }
  if (products.length === 0) {
    warnings.push(`${filename}: \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05D1\u05D3\u05D5\u05D7`);
  }
  return { ownerName, ownerId, reportDate, products, warnings };
}
var _counter = 0;
function uid() {
  return `mislaka_pdf_${Date.now()}_${++_counter}`;
}
function maslakaPdfToFunds(products) {
  return products.filter((p) => {
    const norm2 = normalizeProductType(p.productType);
    if ((norm2 === "insurance_risk" || norm2 === "insurance_mortgage") && p.balance <= 0)
      return false;
    return true;
  }).map((p) => {
    const norm2 = normalizeProductType(p.productType);
    const type = norm2 === "insurance_risk" || norm2 === "insurance_mortgage" ? "bituach" : norm2;
    const monthlyContrib = (p.lastDepositEmployee || 0) + (p.lastDepositEmployer || 0);
    return {
      id: uid(),
      company: p.company,
      type,
      balance: Math.round(p.balance),
      mgmtFeeDeposit: p.mgmtFeeDeposit || 0,
      mgmtFeeBalance: p.mgmtFeeBalance || 0,
      track: p.productType,
      monthlyContrib: Math.round(monthlyContrib),
      openingDate: p.firstJoinDate || p.openingDate,
      insuranceCover: p.pensionDisability !== void 0 ? {
        death: (p.pensionSurvivorsSpouse || 0) > 0,
        disability: (p.pensionDisability || 0) > 0,
        lossOfWork: false
      } : void 0
    };
  });
}

// src/routes/pension.ts
var pensionRouter = Router15();
function buildSummary(policies, fileCount) {
  const totalBalance = policies.reduce((s, p) => s + (p.balance || 0), 0);
  const totalProjectedPension = policies.reduce((s, p) => s + (p.projectedPensionAmount || 0), 0);
  const totalMonthlyContrib = policies.reduce((s, p) => s + (p.monthlyContrib || 0), 0);
  const providers = new Set(policies.map((p) => p.providerName));
  const balanceFees = policies.map((p) => p.mgmtFeeBalance).filter((v) => typeof v === "number");
  const depositFees = policies.map((p) => p.mgmtFeeDeposit).filter((v) => typeof v === "number");
  const avgMgmtFeeBalance = balanceFees.length > 0 ? balanceFees.reduce((a, b) => a + b, 0) / balanceFees.length : 0;
  const avgMgmtFeeDeposit = depositFees.length > 0 ? depositFees.reduce((a, b) => a + b, 0) / depositFees.length : 0;
  const sumByTypes = (types) => policies.filter((p) => types.includes(p.productType)).reduce((s, p) => s + (p.balance || 0), 0);
  return {
    totalBalance,
    totalProjectedPension,
    totalMonthlyContrib,
    policyCount: policies.length,
    fileCount,
    providerCount: providers.size,
    avgMgmtFeeBalance,
    avgMgmtFeeDeposit,
    pensionBalance: sumByTypes(["pension_comprehensive", "pension_general"]),
    gemelBalance: sumByTypes(["gemel", "gemel_investment"]),
    hishtalmutBalance: sumByTypes(["hishtalmut"]),
    insuranceBalance: sumByTypes(["insurance_manager"])
  };
}
var MAX_FILE_BYTES2 = 20 * 1024 * 1024;
var PDF_MAGIC3 = Buffer.from([37, 80, 68, 70]);
var ZIP_MAGIC = Buffer.from([80, 75, 3, 4]);
var XLS_MAGIC = Buffer.from([208, 207, 17, 224]);
function classifyUpload(name, buffer) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return buffer.subarray(0, 4).equals(PDF_MAGIC3) ? "pdf" : null;
  if (ext === "xlsx") return buffer.subarray(0, 4).equals(ZIP_MAGIC) ? "spreadsheet" : null;
  if (ext === "xls") return buffer.subarray(0, 4).equals(XLS_MAGIC) ? "spreadsheet" : null;
  if (ext === "csv" || ext === "txt") return "text";
  return null;
}
function isPasswordPdfError(reason) {
  return /password|encrypt|encrypted/i.test(reason);
}
pensionRouter.post(
  "/parse-pdf",
  requireUser,
  upload.any(),
  asyncHandler(async (req, res) => {
    const errJson = (message, code, status) => res.status(status).json({ error: message, code });
    const fileEntries = req.files || [];
    const password = req.body?.password?.trim() || void 0;
    if (fileEntries.length === 0) {
      return errJson("\u05DC\u05D0 \u05D4\u05D5\u05E2\u05DC\u05D5 \u05E7\u05D1\u05E6\u05D9\u05DD. \u05E6\u05E8\u05E3 \u05E7\u05D5\u05D1\u05E5 \u05D3\u05D9\u05D5\u05D5\u05E8 \u05E9\u05E0\u05EA\u05D9 \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 PDF, Excel \u05D0\u05D5 CSV.", "NO_FILES", 400);
    }
    const files = [];
    for (const entry of fileEntries) {
      const name = entry.originalname || "report.pdf";
      if (entry.size > MAX_FILE_BYTES2) return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9, \u05E2\u05D3 20MB", "FILE_TOO_LARGE", 413);
      const buffer = entry.buffer;
      const kind = classifyUpload(name, buffer);
      if (!kind) {
        return errJson(`\u05E1\u05D5\u05D2 \u05D4\u05E7\u05D5\u05D1\u05E5 ${name} \u05DC\u05D0 \u05E0\u05EA\u05DE\u05DA \u05D0\u05D5 \u05E9\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u2014 \u05D4\u05E2\u05DC\u05D4 PDF, Excel \u05D0\u05D5 CSV`, "INVALID_FILE_TYPE", 400);
      }
      files.push({ name, buffer, kind });
    }
    const pdfFiles = files.filter((f) => f.kind === "pdf");
    const annualFiles = files.map(({ name, buffer }) => ({ name, buffer }));
    const pdfParse4 = (await import("pdf-parse")).default;
    let isMaslaka = false;
    if (pdfFiles.length > 0) {
      try {
        const peek = await pdfParse4(pdfFiles[0].buffer, password ? { password } : void 0);
        const peekText = peek.text || "";
        isMaslaka = peekText.includes("\u05D3\u05D5\u05D7 \u05E8\u05D9\u05DB\u05D5\u05D6 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05DD") || peekText.includes("\u05DE\u05E1\u05DC\u05E7\u05D4 \u05E4\u05E0\u05E1\u05D9\u05D5\u05E0\u05D9\u05EA");
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[parse-pdf] pdf-parse peek failed:", reason);
        if (isPasswordPdfError(reason)) {
          return errJson(
            password ? "\u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05DC\u05D0 \u05E4\u05EA\u05D7\u05D4 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 \u2014 \u05D1\u05D3\u05D5\u05E7 \u05D0\u05D5\u05EA\u05D4 \u05D5\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1" : "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DE\u05D5\u05D2\u05DF \u05D1\u05E1\u05D9\u05E1\u05DE\u05D4 \u2014 \u05D4\u05D6\u05DF \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05E0\u05EA\u05D7 \u05D0\u05D5\u05EA\u05D5",
            password ? "PASSWORD_WRONG" : "PASSWORD_REQUIRED",
            422
          );
        }
        return errJson(`\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
      }
    }
    if (isMaslaka) {
      if (files.some((f) => f.kind !== "pdf")) {
        return errJson("\u05D3\u05D5\u05D7 \u05DE\u05E1\u05DC\u05E7\u05D4 PDF \u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E2\u05E8\u05D1\u05D1 \u05E2\u05DD \u05E7\u05D1\u05E6\u05D9 Excel/CSV \u05D1\u05D0\u05D5\u05EA\u05D4 \u05D4\u05E2\u05DC\u05D0\u05D4", "MIXED_MASLAKA_FILES", 400);
      }
      const allProducts = [];
      const allWarnings = [];
      let ownerName;
      try {
        for (const f of pdfFiles) {
          const result = await parseMaslakaPdf(f.buffer, f.name, password);
          allProducts.push(...result.products);
          allWarnings.push(...result.warnings);
          if (result.ownerName && !ownerName) ownerName = result.ownerName;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[parse-pdf] maslaka parser failed:", reason);
        return errJson(`\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
      }
      const funds = maslakaPdfToFunds(allProducts);
      res.json({ type: "maslaka", ownerName, products: allProducts, funds, warnings: allWarnings });
      return;
    }
    let bundle;
    try {
      bundle = await parseAnnualReportBundle(annualFiles, password);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-pdf] annual parser failed:", reason);
      if (isPasswordPdfError(reason)) {
        return errJson(
          password ? "\u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05DC\u05D0 \u05E4\u05EA\u05D7\u05D4 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 \u2014 \u05D1\u05D3\u05D5\u05E7 \u05D0\u05D5\u05EA\u05D4 \u05D5\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1" : "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DE\u05D5\u05D2\u05DF \u05D1\u05E1\u05D9\u05E1\u05DE\u05D4 \u2014 \u05D4\u05D6\u05DF \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05E0\u05EA\u05D7 \u05D0\u05D5\u05EA\u05D5",
          password ? "PASSWORD_WRONG" : "PASSWORD_REQUIRED",
          422
        );
      }
      return errJson(`\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }
    const summary = buildSummary(bundle.policies, bundle.files.length);
    res.json({ type: "annual", bundle, summary });
  })
);

// src/routes/securities.ts
import { Router as Router16 } from "express";
import * as XLSX3 from "xlsx";
var securitiesRouter = Router16();
var MAX_FILE_BYTES3 = 10 * 1024 * 1024;
function norm(s) {
  return String(s ?? "").toLowerCase().replace(/["'״׳()[\]_\-.\s]/g, "").trim();
}
var SYNONYMS = {
  symbol: ["\u05E1\u05D9\u05DE\u05D5\u05DC", "\u05E1\u05DE\u05DC", "\u05DE\u05E1\u05E4\u05E8\u05E0\u05D9\u05D9\u05E8", "\u05DE\u05E1\u05E0\u05D9\u05D9\u05E8", "\u05DE\u05E1\u05E4\u05E8\u05E0\u05D9", "ticker", "symbol", "isin"],
  name: ["\u05E9\u05DD\u05E0\u05D9\u05D9\u05E8", "\u05E9\u05DD\u05D4\u05E0\u05D9\u05D9\u05E8", "\u05E9\u05DD\u05DE\u05D5\u05E6\u05E8", "\u05EA\u05D9\u05D0\u05D5\u05E8", "\u05E9\u05DD", "name", "description", "security"],
  quantity: ["\u05DB\u05DE\u05D5\u05EA", "\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA", "\u05DE\u05E1\u05E4\u05E8\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA", "quantity", "qty", "units", "shares", "position"],
  avgCost: ["\u05E2\u05DC\u05D5\u05EA\u05DE\u05DE\u05D5\u05E6\u05E2\u05EA", "\u05DE\u05D7\u05D9\u05E8\u05E7\u05E0\u05D9\u05D9\u05D4\u05DE\u05DE\u05D5\u05E6\u05E2", "\u05E2\u05DC\u05D5\u05EA\u05DC\u05D9\u05D7\u05D9\u05D3\u05D4", "\u05DE\u05D7\u05D9\u05E8\u05E2\u05DC\u05D5\u05EA", "avgcost", "averagecost", "costbasis"],
  price: ["\u05E9\u05E2\u05E8", "\u05DE\u05D7\u05D9\u05E8", "\u05E9\u05E2\u05E8\u05E0\u05D5\u05DB\u05D7\u05D9", "\u05E9\u05E2\u05E8\u05E1\u05D2\u05D9\u05E8\u05D4", "price", "last", "marketprice", "currentprice", "close"],
  marketValue: ["\u05E9\u05D5\u05D5\u05D9\u05EA\u05D9\u05E7", "\u05E9\u05D5\u05D5\u05D9\u05D1\u05E9\u05D7", "\u05E9\u05D5\u05D5\u05D9\u05D1\u05E9\u05E7\u05DC", "\u05E9\u05D5\u05D5\u05D9\u05D1\u05E9\u05E7\u05DC\u05D9\u05DD", "\u05E9\u05D5\u05D5\u05D9\u05DB\u05D5\u05DC\u05DC", "\u05E9\u05D5\u05D5\u05D9\u05E0\u05D9", "\u05E9\u05D5\u05D5\u05D9", "marketvalue", "value", "totalvalue", "positionvalue"],
  currency: ["\u05DE\u05D8\u05D1\u05E2", "\u05DE\u05D8\u05D1\u05E2\u05DE\u05E1\u05D7\u05E8", "currency", "ccy"],
  costBasis: ["\u05E2\u05DC\u05D5\u05EA\u05DB\u05D5\u05DC\u05DC\u05EA", "\u05E2\u05DC\u05D5\u05EA\u05EA\u05D9\u05E7", "totalcost", "costbasisils"],
  pnl: ["\u05E8\u05D5\u05D5\u05DC\u05D4\u05E4\u05E1\u05D3", "\u05E8\u05D5\u05D5\u05D7\u05D4\u05E4\u05E1\u05D3", "\u05E8\u05D5\u05D7\u05D4", "\u05E8\u05D5\u05D5\u05DC\u05D4", "pnl", "unrealizedpnl", "gainloss", "profitloss"],
  pnlPct: ["\u05E8\u05D5\u05D5\u05DC", "\u05EA\u05E9\u05D5\u05D0\u05D4", "\u05D0\u05D7\u05D5\u05D6\u05EA\u05E9\u05D5\u05D0\u05D4", "%", "pnl%", "return", "gainpct"],
  kind: ["\u05E1\u05D5\u05D2", "\u05E1\u05D5\u05D2\u05E0\u05D9\u05D9\u05E8", "type", "assettype", "instrumenttype", "kind"]
};
function matchColumn(cell) {
  if (!cell) return null;
  const n = norm(cell);
  if (!n) return null;
  let bestKey = null;
  let bestLen = 0;
  Object.keys(SYNONYMS).forEach((key) => {
    for (const syn of SYNONYMS[key]) {
      if (n.includes(syn) && syn.length > bestLen) {
        bestKey = key;
        bestLen = syn.length;
      }
    }
  });
  return bestKey;
}
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 30);
  let best = null;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    const map = {};
    let score = 0;
    row.forEach((cell, col) => {
      const key = matchColumn(String(cell ?? ""));
      if (key && map[key] === void 0) {
        map[key] = col;
        score += key === "symbol" || key === "name" || key === "quantity" || key === "marketValue" || key === "price" ? 2 : 1;
      }
    });
    const hasId = map.symbol !== void 0 || map.name !== void 0;
    const hasNum = map.quantity !== void 0 || map.marketValue !== void 0 || map.price !== void 0;
    if (hasId && hasNum && score > (best?.score ?? 0)) {
      best = { idx: i, map, score };
    }
  }
  return best ? { idx: best.idx, map: best.map } : null;
}
function toNum(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v == null) return 0;
  const s = String(v).replace(/[₪$,\s]/g, "").replace(/[()]/g, "-").trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
function guessCurrency(v, priceCell, valueCell) {
  const s = String(v ?? "").toUpperCase().trim();
  if (/ILS|שקל|NIS|₪/i.test(s)) return "ILS";
  if (/USD|דולר|\$/i.test(s)) return "USD";
  if (/EUR|יורו|אירו|€/i.test(s)) return "EUR";
  if (/GBP|סטרלינ|£/i.test(s)) return "GBP";
  const combined = String(priceCell ?? "") + " " + String(valueCell ?? "");
  if (/\$/.test(combined)) return "USD";
  if (/€/.test(combined)) return "EUR";
  if (/£/.test(combined)) return "GBP";
  if (/₪/.test(combined)) return "ILS";
  return "ILS";
}
function guessKind(cell, symbol) {
  const n = norm(cell);
  if (!n && !symbol) return "stock";
  if (/etf|סל|מחקה/.test(n)) return "etf";
  if (/bond|אגח|אגרתחוב/.test(n)) return "bond";
  if (/option|אופצ/.test(n)) return "option";
  if (/rsu/.test(n)) return "rsu";
  if (/crypto|ביטקו|מטבעוירטואל/.test(n)) return "crypto";
  if (/fund|קרןנאמנות|קרן/.test(n)) return "fund";
  if (/^(BTC|ETH|SOL|DOGE)/i.test(symbol)) return "crypto";
  if (/^\d{4,}$/.test(symbol)) return "stock";
  return "stock";
}
async function fetchFxRates() {
  const pairs = { USD: "USDILS=X", EUR: "EURILS=X", GBP: "GBPILS=X" };
  const out = { ILS: 1 };
  await Promise.all(
    Object.entries(pairs).map(async ([currency, symbol]) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)" } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof rate === "number" && rate > 0) out[currency] = rate;
      } catch {
      }
    })
  );
  return out;
}
function parseSheet(sheetName, rows, warnings, fxRates) {
  const header = findHeaderRow(rows);
  if (!header) {
    warnings.push(`\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF "${sheetName}": \u05DC\u05D0 \u05D6\u05D5\u05D4\u05EA\u05D4 \u05E9\u05D5\u05E8\u05EA \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u2014 \u05D3\u05DC\u05D2.`);
    return [];
  }
  const { idx: headerIdx, map } = header;
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => c === null || c === void 0 || String(c).trim() === "")) continue;
    const rawSymbol = map.symbol !== void 0 ? String(row[map.symbol] ?? "").trim() : "";
    const rawName = map.name !== void 0 ? String(row[map.name] ?? "").trim() : "";
    const identifier = rawSymbol || rawName;
    if (!identifier) continue;
    const idN = norm(identifier);
    if (/^(סהכ|סךהכל|total|סיכום|גרנדטוטל|subtotal|מזומן|cash)$/.test(idN)) continue;
    const quantity = map.quantity !== void 0 ? toNum(row[map.quantity]) : 0;
    const price = map.price !== void 0 ? toNum(row[map.price]) : 0;
    const avgCost = map.avgCost !== void 0 ? toNum(row[map.avgCost]) : 0;
    const marketValueRaw = map.marketValue !== void 0 ? toNum(row[map.marketValue]) : 0;
    const currency = map.currency !== void 0 ? guessCurrency(row[map.currency], row[map.price ?? -1], row[map.marketValue ?? -1]) : guessCurrency("", row[map.price ?? -1], row[map.marketValue ?? -1]);
    const fx = fxRates[currency] ?? 0;
    const hasFx = currency === "ILS" || fx > 0;
    if (quantity <= 0 && marketValueRaw <= 0) continue;
    const currentPrice = price || (quantity > 0 && marketValueRaw > 0 && hasFx ? marketValueRaw / quantity / fx : 0);
    const marketValueILS = hasFx && marketValueRaw > 0 ? marketValueRaw : hasFx ? quantity * currentPrice * fx : 0;
    const costBasisILS = avgCost > 0 ? quantity * avgCost * fx : marketValueILS;
    const pnlILS = marketValueILS - costBasisILS;
    const pnlPct = costBasisILS > 0 ? pnlILS / costBasisILS * 100 : 0;
    const kind = guessKind(map.kind !== void 0 ? row[map.kind] : "", rawSymbol);
    out.push({
      symbol: rawSymbol || rawName.slice(0, 12),
      name: rawName || void 0,
      kind,
      broker: null,
      currency,
      quantity,
      avg_cost: avgCost || currentPrice,
      current_price: currentPrice,
      fx_rate_to_ils: fx,
      cost_basis_ils: costBasisILS,
      market_value_ils: marketValueILS,
      unrealized_pnl_ils: pnlILS,
      unrealized_pnl_pct: pnlPct,
      sourceRow: r + 1,
      sourceSheet: sheetName
    });
  }
  if (out.length === 0) {
    warnings.push(`\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF "${sheetName}": \u05E0\u05DE\u05E6\u05D0\u05D4 \u05E9\u05D5\u05E8\u05EA \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05D0\u05DA \u05DC\u05D0 \u05D0\u05D5\u05EA\u05E8\u05D5 \u05D4\u05D7\u05D6\u05E7\u05D5\u05EA.`);
  }
  return out;
}
function detectBroker(text) {
  const t = text.toLowerCase();
  if (/מיטב|meitav/i.test(text)) return "\u05DE\u05D9\u05D8\u05D1 \u05D3\u05E9";
  if (/excellence|אקסלנס/i.test(text)) return "\u05D0\u05E7\u05E1\u05DC\u05E0\u05E1";
  if (/psagot|פסגות/i.test(text)) return "\u05E4\u05E1\u05D2\u05D5\u05EA";
  if (/ibi|איביאי|אי\.בי\.אי/i.test(text)) return "IBI";
  if (/interactive ?brokers|ibkr/i.test(t)) return "Interactive Brokers";
  if (/לאומי|leumi/i.test(text)) return "\u05D1\u05E0\u05E7 \u05DC\u05D0\u05D5\u05DE\u05D9";
  if (/הפועלים|hapoalim|poalim/i.test(text)) return "\u05D1\u05E0\u05E7 \u05D4\u05E4\u05D5\u05E2\u05DC\u05D9\u05DD";
  if (/discount|דיסקונט/i.test(text)) return "\u05D1\u05E0\u05E7 \u05D3\u05D9\u05E1\u05E7\u05D5\u05E0\u05D8";
  if (/mizrahi|מזרחי/i.test(text)) return "\u05D1\u05E0\u05E7 \u05DE\u05D6\u05E8\u05D7\u05D9 \u05D8\u05E4\u05D7\u05D5\u05EA";
  return null;
}
securitiesRouter.post(
  "/parse-excel",
  requireUser,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "\u05DC\u05D0 \u05D4\u05D5\u05E2\u05DC\u05D4 \u05E7\u05D5\u05D1\u05E5", code: "NO_FILE" });
      return;
    }
    if (file.size > MAX_FILE_BYTES3) {
      res.status(413).json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9 (\u05E2\u05D3 10MB)", code: "FILE_TOO_LARGE" });
      return;
    }
    const name = file.originalname || "portfolio";
    if (!/\.(xlsx|xls|csv)$/i.test(name)) {
      res.status(400).json({ error: "\u05E8\u05E7 \u05E7\u05D1\u05E6\u05D9 Excel \u05D0\u05D5 CSV \u05E0\u05EA\u05DE\u05DB\u05D9\u05DD", code: "INVALID_EXT" });
      return;
    }
    const buf = file.buffer;
    const isXlsx = /\.xlsx$/i.test(name);
    const isXls = /\.xls$/i.test(name) && !isXlsx;
    if (isXlsx && !(buf[0] === 80 && buf[1] === 75)) {
      res.status(415).json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D0\u05D9\u05E0\u05D5 \u05E7\u05D5\u05D1\u05E5 Excel \u05EA\u05E7\u05D9\u05DF (.xlsx)", code: "BAD_MAGIC" });
      return;
    }
    if (isXls && !(buf[0] === 208 && buf[1] === 207 && buf[2] === 17 && buf[3] === 224)) {
      res.status(415).json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D0\u05D9\u05E0\u05D5 \u05E7\u05D5\u05D1\u05E5 Excel \u05EA\u05E7\u05D9\u05DF (.xls)", code: "BAD_MAGIC" });
      return;
    }
    let wb;
    try {
      wb = XLSX3.read(buf, { type: "buffer", cellDates: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E4\u05EA\u05D5\u05D7 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5: ${reason.slice(0, 100)}`, code: "CORRUPT_FILE" });
      return;
    }
    const warnings = [];
    const allRows = [];
    let rawTextForBrokerDetect = name;
    const fxRates = await fetchFxRates();
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX3.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
      rawTextForBrokerDetect += " " + rows.slice(0, 10).flat().join(" ");
      const parsed = parseSheet(sheetName, rows, warnings, fxRates);
      allRows.push(...parsed);
    }
    const broker = detectBroker(rawTextForBrokerDetect);
    if (broker) allRows.forEach((r) => r.broker = broker);
    const totalValue = allRows.reduce((s, r) => s + (r.market_value_ils || 0), 0);
    res.json({
      rows: allRows,
      warnings,
      stats: { rowCount: allRows.length, totalValue, sheetCount: wb.SheetNames.length },
      meta: { fileName: name, broker }
    });
  })
);

// src/routes/investments.ts
import { Router as Router17 } from "express";
import { z as z7 } from "zod";

// ../lib/doc-parser/broker-pdf-parser.ts
init_server_only();
init_anthropic_client();
import Anthropic3 from "@anthropic-ai/sdk";
var MODEL3 = "claude-sonnet-4-6";
var PdfPasswordRequiredError = class extends Error {
  constructor() {
    super("PDF_PASSWORD_REQUIRED");
    this.name = "PdfPasswordRequiredError";
  }
};
var PdfPasswordWrongError = class extends Error {
  constructor() {
    super("PDF_PASSWORD_WRONG");
    this.name = "PdfPasswordWrongError";
  }
};
function loadPdfjs2() {
  return __require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
}
async function extractBrokerPdf(buffer, password) {
  const pdfjs = loadPdfjs2();
  const data = new Uint8Array(buffer);
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, password: password || void 0 }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      if (err.code === 2) throw new PdfPasswordWrongError();
      throw new PdfPasswordRequiredError();
    }
    throw err;
  }
  const items = [];
  const pageTexts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = /* @__PURE__ */ new Map();
    for (const it of tc.items) {
      const x = it.transform[4];
      const y = it.transform[5];
      const s = it.str;
      if (!s || !s.trim()) continue;
      items.push({ x, y, str: s, page: p });
      const yk = Math.round(y);
      const arr = rows.get(yk) || [];
      arr.push({ x, s });
      rows.set(yk, arr);
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    const lines = [];
    for (const y of ys) {
      const line = rows.get(y).sort((a, b) => a.x - b.x).map((o) => o.s).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
    pageTexts.push(lines.join("\n"));
  }
  return { items, text: pageTexts.join("\n\n") };
}
function parseNum2(s) {
  const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}
var HEADER_TOKENS = {
  securityNumber: "\u05DE\u05E1\u05E4\u05E8 \u05E0\u05D9\u05D9\u05E8",
  name: "\u05E9\u05DD \u05E0\u05D9\u05D9\u05E8",
  quantity: "\u05DB\u05DE\u05D5\u05EA",
  price: "\u05E9\u05E2\u05E8",
  cost: "\u05E2\u05DC\u05D5\u05EA",
  value: "\u05D1\u05E9\u05E7\u05DC\u05D9\u05DD",
  pct: "\u05D0\u05D7\u05D5\u05D6"
};
function guessSymbol(name) {
  const m = name.match(/\(([A-Za-z0-9.\-]{1,8})\)/);
  if (m) return m[1].toUpperCase();
  const latin = name.match(/[A-Za-z0-9.\-]{2,}/g);
  return latin ? latin.join(" ").toUpperCase() : "";
}
function canonicalCashName(name) {
  const probe = name + "|" + name.split("").reverse().join("");
  if (/דולר|רלוד/.test(probe)) return '\u05D3\u05D5\u05DC\u05E8 \u05D0\u05E8\u05D4"\u05D1';
  if (/יורו|ורוי/.test(probe)) return "\u05D9\u05D5\u05E8\u05D5";
  if (/מגן\s?מס|ןגמ/.test(probe)) return "\u05DE\u05D2\u05DF \u05DE\u05E1";
  if (/כספית|תיפסכ|יתרה|הרתי|מזומן/.test(probe)) return "\u05D9\u05EA\u05E8\u05D4 \u05DB\u05E1\u05E4\u05D9\u05EA";
  return null;
}
function guessKind2(name) {
  const n = (name + " " + name.split("").reverse().join("")).toLowerCase();
  if (/דולר|רלוד|יורו|ורוי|מטבע|כספית|תיפסכ|יתרה|הרתי|מזומן|מגן מס|ןגמ|cash|usd|eur/.test(n))
    return "cash";
  if (/btc|eth|crypto|grayscale|ethe|ezbc|bitcoin|קריפ/.test(n)) return "crypto";
  if (/אג["׳']?ח|bond|ממשלת|מק["׳']?מ/.test(n)) return "bond";
  if (/קרן נאמנות|mutual|קרן כספית/.test(n)) return "fund";
  if (/etf|sp ?500|nsdq|nasdaq|s&p|qqq|מדד|סל|תעודת/.test(n)) return "etf";
  return "stock";
}
function parseBlinkTransactions(text) {
  const transactions = [];
  const typeTokens = [
    "\u05D4\u05E4\u05E7\u05D3\u05D4",
    "\u05DE\u05E9\u05D9\u05DB\u05D4",
    "\u05E7\u05E0\u05D9\u05D9\u05D4",
    "\u05E7\u05E0\u05D9\u05D4",
    "\u05DE\u05DB\u05D9\u05E8\u05D4",
    "\u05D3\u05D9\u05D1\u05D9\u05D3\u05E0\u05D3",
    "\u05D7\u05D9\u05D5\u05D1 \u05DE\u05E1",
    "\u05D6\u05D9\u05DB\u05D5\u05D9 \u05DE\u05E1"
  ];
  const tradeTypes = /* @__PURE__ */ new Set(["\u05E7\u05E0\u05D9\u05D9\u05D4", "\u05E7\u05E0\u05D9\u05D4", "\u05DE\u05DB\u05D9\u05E8\u05D4"]);
  for (const line of text.split(/\n+/)) {
    const dateMatch = line.match(/(\d{2})[/.](\d{2})[/.](\d{4})/);
    if (!dateMatch) continue;
    const type = typeTokens.find((token) => line.includes(token));
    if (!type) continue;
    const lineWithoutDate = line.replace(dateMatch[0], "");
    const nums = [...lineWithoutDate.matchAll(/-?\d[\d,]*\.\d+|-?\d[\d,]*/g)].map((m) => parseNum2(m[0])).filter((v) => v != null);
    const symbolMatch = line.match(/\b[A-Z][A-Z0-9.]{1,9}\b/);
    let amount = 0;
    let quantity = 0;
    if (tradeTypes.has(type)) {
      if (nums.length >= 3) amount = nums[nums.length - 3];
      if (nums.length >= 1) quantity = Math.abs(nums[nums.length - 1]);
    } else if (nums.length) {
      amount = nums[nums.length - 1];
    }
    transactions.push({
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      type,
      name: symbolMatch?.[0] ?? "",
      quantity,
      amount
    });
  }
  return transactions;
}
function toIsoDate(day, month, year) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseDateMatch(m) {
  let year = +m[3];
  if (year > 0 && year < 100) year += 2e3;
  return toIsoDate(+m[1], +m[2], year);
}
function detectBlinkReportDate(text) {
  const compact = text.replace(/\s+/g, "");
  const datePattern = String.raw`(\d{2})[/.-](\d{2})[/.-](\d{2,4})`;
  const preferredPatterns = [
    new RegExp(String.raw`לתאריך${datePattern}`),
    new RegExp(String.raw`פירוטיתרותליום${datePattern}`),
    new RegExp(String.raw`יתרותליום${datePattern}`)
  ];
  for (const pattern of preferredPatterns) {
    const match = compact.match(pattern);
    if (match) return parseDateMatch(match);
  }
  return detectReportDate(text);
}
var SHADOW_DX = 28;
var SHADOW_DY = 12;
function tryBlinkParse(extracted) {
  const text = extracted.text;
  const collapsed = text.replace(/\s+/g, "");
  if (!collapsed.includes("heyblink.com") && !collapsed.toLowerCase().includes("blink")) return null;
  const raw = extracted.items.filter((it) => it.page === 1 || it.page === void 0);
  if (raw.length === 0) return null;
  const BLINK_HEADERS = {
    pct: "\u05D0\u05D7\u05D5\u05D6",
    value: "\u05E9\u05D5\u05D5\u05D9",
    price: "\u05DE\u05D7\u05D9\u05E8",
    quantity: "\u05DB\u05DE\u05D5\u05EA",
    name: "\u05E9\u05DD \u05D4\u05E0\u05D9\u05D9\u05E8"
  };
  const headerXs = {};
  let headerY = null;
  let totalY = null;
  for (const it of raw) {
    const s = it.str.replace(/\s+/g, " ").trim();
    for (const [key, token] of Object.entries(BLINK_HEADERS)) {
      if (headerXs[key] == null && s.includes(token)) {
        headerXs[key] = it.x;
        if (headerY == null) headerY = it.y;
      }
    }
    if (totalY == null && (s.includes('\u05E1\u05D4"\u05DB') || s.includes("\u05E1\u05D4\u05F4\u05DB"))) totalY = it.y;
  }
  if (headerY == null || totalY == null || headerXs.value == null || headerXs.name == null) {
    return null;
  }
  const totalValue = raw.filter((it) => Math.abs(it.y - totalY) <= 4).map((it) => parseNum2(it.str)).filter((v) => v != null).reduce((mx, v) => Math.max(mx, v), 0) || 0;
  if (totalValue <= 0) return null;
  const rowsByY = /* @__PURE__ */ new Map();
  for (const it of raw) {
    if (it.y > headerY - 3 || it.y < totalY + 2) continue;
    let foundY = null;
    for (const y of rowsByY.keys()) {
      if (Math.abs(y - it.y) <= 4) {
        foundY = y;
        break;
      }
    }
    if (foundY === null) {
      foundY = it.y;
      rowsByY.set(foundY, []);
    }
    rowsByY.get(foundY).push(it);
  }
  const holdings = [];
  for (const rowItems of rowsByY.values()) {
    rowItems.sort((a, b) => a.x - b.x);
    const pickCol = (targetX, maxDist = 60) => {
      let closest = null;
      let minD = Infinity;
      for (const item of rowItems) {
        const d = Math.abs(item.x - targetX);
        if (d < minD && d < maxDist) {
          minD = d;
          closest = item;
        }
      }
      return closest;
    };
    const valueItem = pickCol(headerXs.value);
    if (!valueItem) continue;
    const value = parseNum2(valueItem.str);
    if (value == null) continue;
    const qtyItem = pickCol(headerXs.quantity);
    const priceItem = pickCol(headerXs.price);
    const pctItem = pickCol(headerXs.pct);
    let nameStr = "";
    const nameItem = pickCol(headerXs.name, 150);
    if (nameItem) {
      const nameItems = rowItems.filter((i) => i.x > headerXs.quantity + 40);
      nameStr = nameItems.map((i) => i.str).join(" ").trim();
    } else {
      nameStr = rowItems[rowItems.length - 1].str.trim();
    }
    if (!nameStr) continue;
    const cashName = canonicalCashName(nameStr);
    const finalName = cashName || nameStr;
    const kind = guessKind2(finalName);
    holdings.push({
      securityNumber: "",
      name: finalName,
      symbol: kind === "cash" ? "" : guessSymbol(finalName) || finalName.split(" ")[0],
      assetKind: kind,
      quantity: qtyItem ? parseNum2(qtyItem.str) || 0 : 0,
      priceCurrent: priceItem ? parseNum2(priceItem.str) || 0 : 0,
      valueIls: value,
      costIls: 0,
      pctOfPortfolio: pctItem ? parseNum2(pctItem.str) || 0 : 0
    });
  }
  if (holdings.length < 2) return null;
  const sum = holdings.reduce((s, h) => s + h.valueIls, 0);
  if (Math.abs(sum - totalValue) / totalValue > 0.02) return null;
  const mEmail = collapsed.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
  return {
    broker: "Blink",
    accountNumber: mEmail ? mEmail[1] : "",
    reportDate: detectBlinkReportDate(text),
    currency: text.includes("\u05D3\u05D5\u05DC\u05E8") ? "USD" : "ILS",
    totalValueIls: totalValue,
    holdings,
    transactions: parseBlinkTransactions(text),
    warnings: []
  };
}
function tryDeterministicParse(extracted) {
  const blink = tryBlinkParse(extracted);
  if (blink) return blink;
  const raw = extracted.items.filter((it) => it.page === 1 || it.page === void 0);
  if (raw.length === 0) return null;
  const items = raw.filter(
    (o) => !raw.some(
      (t) => t.str === o.str && Math.abs(t.x - (o.x - SHADOW_DX)) < 3 && Math.abs(t.y - (o.y + SHADOW_DY)) < 3
    )
  );
  const headerXs = {};
  let headerY = null;
  let totalY = null;
  for (const it of items) {
    const s = it.str.replace(/\s+/g, " ").trim();
    for (const [key, token] of Object.entries(HEADER_TOKENS)) {
      if (headerXs[key] == null && s.includes(token)) {
        headerXs[key] = it.x;
        if (headerY == null) headerY = it.y;
      }
    }
    if (totalY == null && (s.includes('\u05E1\u05D4"\u05DB') || s.includes("\u05E1\u05D4\u05F4\u05DB"))) totalY = it.y;
  }
  if (headerY == null || totalY == null || headerXs.value == null || headerXs.securityNumber == null) {
    return null;
  }
  const totalValue = items.filter((it) => Math.abs(it.y - totalY) <= 4).map((it) => parseNum2(it.str)).filter((v) => v != null).reduce((mx, v) => Math.max(mx, v), 0) || 0;
  if (totalValue <= 0) return null;
  const band = (center, halfL, halfR) => [
    center - halfL,
    center + halfR
  ];
  const secMinX = headerXs.securityNumber - 12;
  const quantityBand = band(headerXs.quantity ?? 319, 41, 29);
  const valueX = headerXs.value;
  const bands = {
    // pct is the leftmost column, just left of value (no usable header glyph).
    pct: [Math.max(0, valueX - 86), valueX - 14],
    value: band(valueX, 14, 40),
    cost: band(headerXs.cost ?? 165, 27, 33),
    price: band(headerXs.price ?? 241, 36, 27),
    quantity: quantityBand,
    // Names sit between the quantity column and the security-number column.
    name: [quantityBand[1], secMinX]
  };
  const inBand = (x, b) => x >= b[0] && x < b[1];
  const pickNum = (ay, b) => {
    const c = items.filter((o) => inBand(o.x, b) && Math.abs(o.y - ay) <= 4 && parseNum2(o.str) != null).sort((a, z8) => Math.abs(a.y - ay) - Math.abs(z8.y - ay));
    return c.length ? parseNum2(c[0].str) : null;
  };
  const pickName = (ay) => {
    let c = items.filter((o) => inBand(o.x, bands.name) && Math.abs(o.y - ay) < 0.6);
    if (!c.length) c = items.filter((o) => inBand(o.x, bands.name) && Math.abs(o.y - ay) <= 4);
    return c.sort((a, z8) => a.x - z8.x).map((o) => o.str).join("").replace(/\s+/g, " ").trim();
  };
  const anchors = items.filter(
    (o) => /^\d{6,8}$/.test(o.str.trim()) && o.x >= secMinX && o.y < headerY - 3 && o.y > totalY + 2
  ).sort((a, z8) => z8.y - a.y);
  const holdings = [];
  for (const a of anchors) {
    const value = pickNum(a.y, bands.value);
    if (value == null) continue;
    const rawName = pickName(a.y).replace(/([֐-׿.])([A-Za-z])/g, "$1 $2").replace(/([A-Za-z])([֐-׿])/g, "$1 $2").trim();
    const kind = guessKind2(rawName);
    const cashName = canonicalCashName(rawName);
    const name = cashName || rawName || a.str.trim();
    holdings.push({
      securityNumber: a.str.trim(),
      name,
      symbol: kind === "cash" ? "" : guessSymbol(rawName),
      assetKind: kind,
      quantity: pickNum(a.y, bands.quantity) ?? 0,
      priceCurrent: pickNum(a.y, bands.price) ?? 0,
      valueIls: value,
      costIls: pickNum(a.y, bands.cost) ?? 0,
      pctOfPortfolio: pickNum(a.y, bands.pct) ?? 0
    });
  }
  const anchorYs = anchors.map((a) => a.y);
  const addedYs = [];
  for (const o of items.slice().sort((a, z8) => z8.y - a.y)) {
    if (!inBand(o.x, bands.value) || parseNum2(o.str) == null) continue;
    if (o.y >= headerY - 3 || o.y <= totalY + 2) continue;
    if (anchorYs.some((ay) => Math.abs(ay - o.y) <= 4)) continue;
    if (addedYs.some((y) => Math.abs(y - o.y) <= 3)) continue;
    const cashName = canonicalCashName(pickName(o.y));
    if (!cashName) continue;
    const value = pickNum(o.y, bands.value);
    if (value == null) continue;
    addedYs.push(o.y);
    holdings.push({
      securityNumber: "",
      name: cashName,
      symbol: "",
      assetKind: "cash",
      quantity: 0,
      priceCurrent: 0,
      valueIls: value,
      costIls: 0,
      pctOfPortfolio: pickNum(o.y, bands.pct) ?? 0
    });
  }
  if (holdings.length < 2) return null;
  const sum = holdings.reduce((s, h) => s + h.valueIls, 0);
  if (Math.abs(sum - totalValue) / totalValue > 0.02) return null;
  return {
    broker: detectBroker2(extracted.text),
    accountNumber: detectAccountNumber(extracted.text),
    reportDate: detectReportDate(extracted.text),
    currency: "ILS",
    totalValueIls: totalValue,
    holdings,
    transactions: [],
    warnings: []
  };
}
function detectBroker2(text) {
  const head = text.slice(0, 800);
  const candidates = [
    "\u05D0\u05E7\u05E1\u05DC\u05E0\u05E1",
    "\u05DE\u05D9\u05D8\u05D1",
    "\u05E4\u05E1\u05D2\u05D5\u05EA",
    "\u05D0\u05DC\u05D8\u05E9\u05D5\u05DC\u05E8",
    "\u05D9\u05DC\u05D9\u05DF \u05DC\u05E4\u05D9\u05D3\u05D5\u05EA",
    "\u05D4\u05E8\u05D0\u05DC",
    "\u05DB\u05DC\u05DC",
    "\u05DE\u05E0\u05D5\u05E8\u05D4",
    "\u05D0\u05E0\u05DC\u05D9\u05E1\u05D8",
    "\u05DE\u05D5\u05E8"
  ];
  for (const c of candidates) if (head.includes(c)) return c;
  const collapsed = text.replace(/\s+/g, "");
  const reversed = collapsed.split("").reverse().join("");
  if (/IBI|אי\.?בי\.?אי/.test(collapsed) || /IBI|אי\.?בי\.?אי/.test(reversed)) return "IBI";
  return "\u05D1\u05D9\u05EA \u05D4\u05E9\u05E7\u05E2\u05D5\u05EA";
}
function detectAccountNumber(text) {
  const m = text.match(/לחשבון מס['׳]?\s*:?\s*(\d{4,})/);
  return m ? m[1] : "";
}
function detectReportDate(text) {
  const t = text.replace(/\s+/g, "");
  const dates = [...t.matchAll(/(\d{2})[/.-](\d{2})[/.-](\d{2,4})/g)].map((m) => {
    let y = +m[3];
    if (y > 0 && y < 100) y += 2e3;
    return { d: +m[1], mo: +m[2], y };
  }).filter((x) => x.y >= 2e3 && x.y <= 2100 && x.mo >= 1 && x.mo <= 12 && x.d >= 1 && x.d <= 31).map((x) => ({
    iso: `${x.y}-${String(x.mo).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`,
    t: Date.UTC(x.y, x.mo - 1, x.d)
  }));
  if (dates.length === 0) return "";
  const cutoff = Date.now() + 864e5;
  const past = dates.filter((d) => d.t <= cutoff);
  return (past.length ? past : dates).sort((a, b) => b.t - a.t)[0].iso;
}
var REPORT_SCHEMA = {
  type: "object",
  properties: {
    broker: {
      type: "string",
      description: 'Investment house name (e.g. "\u05DE\u05D9\u05D8\u05D1", "\u05D0\u05E7\u05E1\u05DC\u05E0\u05E1"). "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4" if unclear.'
    },
    accountNumber: { type: "string", description: "Account number (\u05DE\u05E1\u05E4\u05E8 \u05D7\u05E9\u05D1\u05D5\u05DF). Empty if absent." },
    reportDate: {
      type: "string",
      description: 'Statement "as of" date in ISO YYYY-MM-DD (the \u05DE\u05E6\u05D1 \u05D7\u05E9\u05D1\u05D5\u05E0\u05DA \u05DC\u05D9\u05D5\u05DD date). Empty if unresolvable.'
    },
    currency: { type: "string", description: 'Portfolio base currency, usually "ILS".' },
    totalValueIls: {
      type: "number",
      description: 'Grand total portfolio value in ILS (the \u05E1\u05D4"\u05DB row).'
    },
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          securityNumber: { type: "string" },
          name: { type: "string" },
          symbol: {
            type: "string",
            description: 'Ticker for market sync, uppercase. Extract from names like "NVIDIA(NVDA)" \u2192 "NVDA", "INVESCO (QQQ)" \u2192 "QQQ". Empty if none.'
          },
          assetKind: {
            type: "string",
            enum: ["stock", "etf", "crypto", "bond", "fund", "cash"],
            description: 'Classify: single companies (INTEL, NVIDIA, GAP, ALIBABA) = stock; index/sector trackers (SP 500, NSDQ100, QQQ) = etf; crypto trusts/ETFs (GRAYSCALE ETHE, EZBC, BTC) = crypto; mutual funds = fund; bonds = bond; currency/cash balances (\u05D3\u05D5\u05DC\u05E8 \u05D0\u05E8\u05D4"\u05D1, \u05D9\u05EA\u05E8\u05D4 \u05DB\u05E1\u05E4\u05D9\u05EA, \u05DE\u05D2\u05DF \u05DE\u05E1) = cash.'
          },
          quantity: { type: "number" },
          priceCurrent: { type: "number", description: "\u05E9\u05E2\u05E8 \u05E0\u05D5\u05DB\u05D7\u05D9 \u2014 current quote as printed." },
          valueIls: { type: "number", description: "\u05E9\u05D5\u05D5\u05D9 \u05E0\u05D9\u05D9\u05E8 \u05D1\u05E9\u05E7\u05DC\u05D9\u05DD \u2014 total ILS value." },
          costIls: { type: "number", description: "\u05E2\u05DC\u05D5\u05EA \u05E8\u05DB\u05D9\u05E9\u05D4 \u2014 total ILS purchase cost." },
          pctOfPortfolio: { type: "number", description: "\u05D0\u05D7\u05D5\u05D6 \u05DE\u05D4\u05EA\u05D9\u05E7." }
        },
        required: [
          "securityNumber",
          "name",
          "symbol",
          "assetKind",
          "quantity",
          "priceCurrent",
          "valueIls",
          "costIls",
          "pctOfPortfolio"
        ],
        additionalProperties: false
      }
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "ISO YYYY-MM-DD; empty if unresolvable." },
          type: { type: "string", description: "Operation in Hebrew (\u05E7\u05E0\u05D9\u05D4/\u05DE\u05DB\u05D9\u05E8\u05D4/\u05D4\u05E4\u05E7\u05D3\u05D4/\u05D3\u05D9\u05D1\u05D9\u05D3\u05E0\u05D3\u2026)." },
          name: { type: "string" },
          quantity: { type: "number" },
          amount: { type: "number", description: "Charge (+) / credit (\u2212). 0 if not shown." }
        },
        required: ["date", "type", "name", "quantity", "amount"],
        additionalProperties: false
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["broker", "accountNumber", "reportDate", "currency", "totalValueIls", "holdings", "transactions"],
  additionalProperties: false
};
var SYSTEM_PROMPT3 = `You are extracting a structured securities portfolio from the text layer of an
Israeli investment-house account statement.

The text was reconstructed from a PDF. Hebrew prose lines are reversed and
letter-spaced \u2014 IGNORE the paragraphs of disclaimers/legal text. Focus only on
the two data tables:

  \u2022 "\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D9\u05EA\u05E8\u05D5\u05EA" (holdings) \u2014 columns, right-to-left:
       \u05DE\u05E1\u05E4\u05E8 \u05E0\u05D9\u05D9\u05E8 | \u05E9\u05DD \u05E0\u05D9\u05D9\u05E8 | \u05DB\u05DE\u05D5\u05EA | \u05E9\u05E2\u05E8 \u05E0\u05D5\u05DB\u05D7\u05D9 | \u05E2\u05DC\u05D5\u05EA \u05E8\u05DB\u05D9\u05E9\u05D4 | \u05E9\u05D5\u05D5\u05D9 \u05E0\u05D9\u05D9\u05E8 \u05D1\u05E9\u05E7\u05DC\u05D9\u05DD | \u05D0\u05D7\u05D5\u05D6 \u05DE\u05D4\u05EA\u05D9\u05E7
    The text layer may be doubled (a shadow copy) and the security NAME, NUMBER
    and the numeric columns can land on slightly different baselines. Use the
    security number, the % column, and the running totals to align each
    holding's numbers with its name. The final "\u05E1\u05D4"\u05DB" row is the portfolio
    grand total (in ILS) \u2014 put it in totalValueIls, NOT in holdings.

  \u2022 "\u05E4\u05D9\u05E8\u05D5\u05D8 \u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05D1\u05D7\u05E9\u05D1\u05D5\u05DF" (transactions) \u2014 date, operation type, name, quantity,
    amounts. Include every transaction row you can resolve.

Rules:
- Numbers use thousands separators (17,448.00). Parse them as plain numbers.
- valueIls and costIls are TOTALS for the holding (already in ILS), not per-unit.
- Do not invent holdings. If a value is genuinely unreadable, add a warning
  rather than guessing.
- Currency/cash rows (\u05D3\u05D5\u05DC\u05E8 \u05D0\u05E8\u05D4"\u05D1, \u05D9\u05EA\u05E8\u05D4 \u05DB\u05E1\u05E4\u05D9\u05EA/\u05DB\u05E1\u05E4\u05D9\u05EA, \u05DE\u05D2\u05DF \u05DE\u05E1) are real holdings \u2014
  include them with assetKind "cash".
- If the document is not an investment statement, return empty holdings with a
  warning explaining what you saw.`;
async function analyzeBrokerReport(text, filename) {
  if (!getAnthropicKey()) {
    return errorReport("\u05E0\u05D9\u05EA\u05D5\u05D7 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u2014 \u05DE\u05E4\u05EA\u05D7 Anthropic \u05D7\u05E1\u05E8 \u05D1\u05E1\u05D1\u05D9\u05D1\u05EA \u05D4\u05E9\u05E8\u05EA");
  }
  const client2 = createAnthropicClient();
  if (!client2) return errorReport("\u05E0\u05D9\u05EA\u05D5\u05D7 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u2014 \u05DE\u05E4\u05EA\u05D7 Anthropic \u05D7\u05E1\u05E8 \u05D1\u05E1\u05D1\u05D9\u05D1\u05EA \u05D4\u05E9\u05E8\u05EA");
  try {
    const response = await client2.messages.parse({
      model: MODEL3,
      max_tokens: 16e3,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT3, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the portfolio from this statement (${filename}):

${text}`
            }
          ]
        }
      ],
      output_config: {
        format: { type: "json_schema", schema: REPORT_SCHEMA }
      }
    });
    const parsed = response.parsed_output;
    if (!parsed || !Array.isArray(parsed.holdings)) {
      return errorReport("Claude \u05D6\u05D9\u05D4\u05D4 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 \u05D0\u05D1\u05DC \u05D4\u05E4\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05D0\u05DD \u05D0\u05EA \u05D4\u05E1\u05DB\u05DE\u05D4 \u05D4\u05E6\u05E4\u05D5\u05D9\u05D4 \u2014 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1");
    }
    return {
      broker: parsed.broker || "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4",
      accountNumber: parsed.accountNumber || "",
      reportDate: parsed.reportDate || "",
      currency: parsed.currency || "ILS",
      totalValueIls: parsed.totalValueIls || 0,
      holdings: parsed.holdings,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
  } catch (err) {
    if (err instanceof Anthropic3.RateLimitError) return errorReport("\u05D4\u05E9\u05E8\u05EA \u05EA\u05E4\u05D5\u05E1 \u05DB\u05E8\u05D2\u05E2 \u2014 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4");
    if (err instanceof Anthropic3.AuthenticationError) return errorReport("\u05D1\u05E2\u05D9\u05D9\u05EA \u05D4\u05E8\u05E9\u05D0\u05D5\u05EA API \u2014 \u05E4\u05E0\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA");
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[broker-pdf-parser] analyze failed:", reason);
    return errorReport(`\u05DB\u05E9\u05DC \u05D1\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05D3\u05D5\u05D7: ${reason.slice(0, 120)}`);
  }
}
async function extractTransactionsAi(text) {
  const client2 = createAnthropicClient();
  if (!client2) return [];
  const TRANSACTIONS_SCHEMA = {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "ISO YYYY-MM-DD; empty if unresolvable." },
            type: { type: "string", description: "Operation in Hebrew (\u05E7\u05E0\u05D9\u05D4/\u05DE\u05DB\u05D9\u05E8\u05D4/\u05D4\u05E4\u05E7\u05D3\u05D4/\u05D3\u05D9\u05D1\u05D9\u05D3\u05E0\u05D3\u2026)." },
            name: { type: "string" },
            quantity: { type: "number" },
            amount: { type: "number", description: "Charge (+) / credit (\u2212). 0 if not shown." }
          },
          required: ["date", "type", "name", "quantity", "amount"],
          additionalProperties: false
        }
      }
    },
    required: ["transactions"],
    additionalProperties: false
  };
  try {
    const response = await client2.messages.parse({
      model: MODEL3,
      max_tokens: 8e3,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: `Extract all transactions (\u05E4\u05D9\u05E8\u05D5\u05D8 \u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05D1\u05D7\u05E9\u05D1\u05D5\u05DF) from this account statement text.
Include every transaction row you can resolve: date, operation type (\u05E7\u05E0\u05D9\u05D4, \u05DE\u05DB\u05D9\u05E8\u05D4, \u05D4\u05E4\u05E7\u05D3\u05D4, \u05D3\u05D9\u05D1\u05D9\u05D3\u05E0\u05D3, etc.),
security name, quantity, and amounts. Include deposits (\u05D4\u05E4\u05E7\u05D3\u05D4) and withdrawals (\u05DE\u05E9\u05D9\u05DB\u05D4) as well.
The text layer may be scrambled; do your best to reconstruct each transaction.`,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract transactions from this statement:

${text}`
            }
          ]
        }
      ],
      output_config: {
        format: { type: "json_schema", schema: TRANSACTIONS_SCHEMA }
      }
    });
    const parsed = response.parsed_output;
    return Array.isArray(parsed?.transactions) ? parsed.transactions : [];
  } catch {
    return [];
  }
}
function errorReport(warning) {
  return {
    broker: "\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4",
    accountNumber: "",
    reportDate: "",
    currency: "ILS",
    totalValueIls: 0,
    holdings: [],
    transactions: [],
    warnings: [warning]
  };
}

// src/routes/investments.ts
var investmentsRouter = Router17();
investmentsRouter.use(requireUser);
investmentsRouter.delete(
  "/reset",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    if (!householdId) {
      res.status(400).json({ error: "Missing household ID" });
      return;
    }
    if (!await assertHouseholdAccess(sb, req.user.id, householdId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { error: clientStateError } = await sb.from("client_state").delete().eq("household_id", householdId).in("state_key", ["portfolio_positions", "portfolio_accounts"]);
    if (clientStateError) {
      console.error("[investments/reset] client_state delete failed:", clientStateError.message);
      res.status(500).json({ error: "Failed to delete portfolio data" });
      return;
    }
    const { error: reportsError } = await sb.from("investment_reports").delete().eq("household_id", householdId);
    if (reportsError) {
      console.error("[investments/reset] investment_reports delete failed:", reportsError.message);
      res.status(500).json({ error: "Failed to delete investment reports" });
      return;
    }
    res.json({ ok: true, message: "Investment data reset successfully" });
  })
);
var MAX_FILE_BYTES4 = 20 * 1024 * 1024;
var PDF_MAGIC4 = Buffer.from([37, 80, 68, 70]);
investmentsRouter.post(
  "/parse-report",
  upload.any(),
  asyncHandler(async (req, res) => {
    const errJson = (message, code, status) => res.status(status).json({ error: message, code });
    const entry = (req.files || [])[0];
    const password = req.body?.password?.trim() || void 0;
    if (!entry) return errJson("\u05DC\u05D0 \u05D4\u05D5\u05E2\u05DC\u05D4 \u05E7\u05D5\u05D1\u05E5. \u05E6\u05E8\u05E3 \u05D3\u05D5\u05D7 PDF \u05DE\u05D1\u05D9\u05EA \u05D4\u05D4\u05E9\u05E7\u05E2\u05D5\u05EA.", "NO_FILES", 400);
    if (entry.size > MAX_FILE_BYTES4) return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9, \u05E2\u05D3 20MB", "FILE_TOO_LARGE", 413);
    const name = entry.originalname || "report.pdf";
    const buffer = entry.buffer;
    if (!buffer.subarray(0, 4).equals(PDF_MAGIC4)) {
      return errJson(`\u05D4\u05E7\u05D5\u05D1\u05E5 ${name} \u05D0\u05D9\u05E0\u05D5 PDF \u05EA\u05E7\u05D9\u05DF`, "INVALID_FILE_TYPE", 400);
    }
    let extracted;
    try {
      extracted = await extractBrokerPdf(buffer, password);
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        return errJson("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DE\u05D5\u05D2\u05DF \u05D1\u05E1\u05D9\u05E1\u05DE\u05D4 \u2014 \u05D4\u05D6\u05DF \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05E0\u05EA\u05D7 \u05D0\u05D5\u05EA\u05D5", "PASSWORD_REQUIRED", 422);
      }
      if (err instanceof PdfPasswordWrongError) {
        return errJson("\u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05E9\u05D2\u05D5\u05D9\u05D4 \u2014 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1", "PASSWORD_WRONG", 422);
      }
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[parse-report] extraction failed:", reason);
      return errJson(`\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05E7\u05E8\u05D5\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D1\u05E5 (${reason.slice(0, 120)})`, "CORRUPT_PDF", 422);
    }
    if (!extracted.text.trim()) {
      return errJson("\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D8\u05E7\u05E1\u05D8 \u05D1\u05E7\u05D5\u05D1\u05E5 \u2014 \u05D9\u05D9\u05EA\u05DB\u05DF \u05E9\u05D4\u05D5\u05D0 \u05E1\u05E8\u05D5\u05E7 \u05DB\u05EA\u05DE\u05D5\u05E0\u05D4. \u05E0\u05E1\u05D4 \u05E7\u05D5\u05D1\u05E5 \u05D0\u05D7\u05E8.", "EMPTY_PDF", 422);
    }
    let report = tryDeterministicParse(extracted);
    let method = "deterministic";
    if (!report) {
      method = "ai";
      report = await analyzeBrokerReport(extracted.text, name);
    } else if (report.transactions.length === 0 && report.holdings.length > 0) {
      const aiTransactions = await extractTransactionsAi(extracted.text);
      if (aiTransactions.length > 0) report.transactions = aiTransactions;
    }
    res.json({ report, method });
  })
);
var HoldingSchema = z7.object({
  securityNumber: z7.string().default(""),
  name: z7.string().default(""),
  symbol: z7.string().default(""),
  assetKind: z7.enum(["stock", "etf", "crypto", "bond", "fund", "cash"]).default("stock"),
  quantity: z7.number().default(0),
  priceCurrent: z7.number().default(0),
  valueIls: z7.number().default(0),
  costIls: z7.number().default(0),
  pctOfPortfolio: z7.number().default(0)
});
var TransactionSchema = z7.object({
  date: z7.string().default(""),
  type: z7.string().default(""),
  name: z7.string().default(""),
  quantity: z7.number().default(0),
  amount: z7.number().default(0)
});
var ReportSchema = z7.object({
  broker: z7.string().default("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D4"),
  accountNumber: z7.string().default(""),
  reportDate: z7.string().default(""),
  currency: z7.string().default("ILS"),
  totalValueIls: z7.number().default(0),
  holdings: z7.array(HoldingSchema).default([]),
  transactions: z7.array(TransactionSchema).default([]),
  warnings: z7.array(z7.string()).optional()
});
var BodySchema4 = z7.object({
  householdId: z7.string().uuid(),
  report: ReportSchema
});
investmentsRouter.post(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const user = req.user;
    let body;
    try {
      body = BodySchema4.parse(req.body);
    } catch (e) {
      const detail = e instanceof z7.ZodError ? e.issues.map((i) => i.message).join(", ") : "invalid body";
      res.status(400).json({ ok: false, error: "invalid_body", detail });
      return;
    }
    const { householdId, report } = body;
    if (!await assertHouseholdAccess(sb, user.id, householdId)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const broker = report.broker || "";
    const accountNumber = report.accountNumber || "";
    const reportDate = report.reportDate || null;
    const { data: existing } = await sb.from("investment_reports").select("id, report_date").eq("household_id", householdId).eq("broker", broker).eq("account_number", accountNumber).eq("report_date", reportDate || "1970-01-01").maybeSingle();
    const row = {
      household_id: householdId,
      broker,
      account_number: accountNumber,
      report_date: reportDate,
      currency: report.currency,
      total_value_ils: report.totalValueIls,
      holdings: report.holdings,
      transactions: report.transactions,
      summary: {
        holdingCount: report.holdings.length,
        transactionCount: report.transactions.length
      },
      created_by: user.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    let data = null;
    let error = null;
    let replaced = !!existing;
    if (existing) {
      const result = await sb.from("investment_reports").update(row).eq("id", existing.id).select("id").single();
      data = result.data;
      error = result.error;
    } else {
      const result = await sb.from("investment_reports").insert(row).select("id").single();
      data = result.data;
      error = result.error;
      if (error && /duplicate key value/i.test(error.message)) {
        const retry = await sb.from("investment_reports").update(row).eq("household_id", householdId).eq("broker", broker).eq("account_number", accountNumber).eq("report_date", reportDate || "1970-01-01").select("id").single();
        data = retry.data;
        error = retry.error;
        replaced = !retry.error;
      }
    }
    if (error || !data) {
      const detail = error?.message || "no_saved_row";
      console.error("[investments/reports] save failed:", detail);
      res.status(500).json({ ok: false, error: "save_failed", detail });
      return;
    }
    const { data: newer } = await sb.from("investment_reports").select("id").eq("household_id", householdId).eq("broker", broker).eq("account_number", accountNumber).gt("report_date", reportDate || "1970-01-01").limit(1).maybeSingle();
    res.json({ ok: true, id: data.id, replaced, isLatest: !newer });
  })
);
investmentsRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    if (!householdId) {
      res.status(400).json({ ok: false, error: "missing_household" });
      return;
    }
    if (!await assertHouseholdAccess(sb, req.user.id, householdId)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const { data, error } = await sb.from("investment_reports").select(
      "id, broker, account_number, report_date, currency, total_value_ils, holdings, transactions, summary, created_at"
    ).eq("household_id", householdId).order("report_date", { ascending: false, nullsFirst: false }).limit(50);
    if (error) {
      res.status(500).json({ ok: false, error: "query_failed", detail: error.message });
      return;
    }
    res.json({ ok: true, reports: data ?? [] });
  })
);
investmentsRouter.delete(
  "/reports",
  asyncHandler(async (req, res) => {
    const sb = req.sb;
    const householdId = typeof req.query.householdId === "string" ? req.query.householdId : null;
    const reportId = typeof req.query.reportId === "string" ? req.query.reportId : null;
    if (!householdId || !reportId) {
      res.status(400).json({ ok: false, error: "missing_params" });
      return;
    }
    if (!await assertHouseholdAccess(sb, req.user.id, householdId)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const { error } = await sb.from("investment_reports").delete().eq("id", reportId).eq("household_id", householdId);
    if (error) {
      console.error("[investments/reports] delete failed:", error.message);
      res.status(500).json({ ok: false, error: "delete_failed", detail: error.message });
      return;
    }
    res.json({ ok: true });
  })
);

// src/routes/market.ts
import { Router as Router18 } from "express";
var marketRouter = Router18();
var KIND_SYMBOL_RE = /^[A-Z0-9.^=-]{1,16}$/;
var COIN_ID_RE = /^[a-z0-9-]{1,40}$/;
var CACHE_TTL_MS = 10 * 60 * 1e3;
var cache = /* @__PURE__ */ new Map();
function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
  return fetcher().then((v) => {
    cache.set(key, { value: v, expiresAt: Date.now() + CACHE_TTL_MS });
    return v;
  });
}
async function fetchYahooQuote(symbol) {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)" } });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? price;
  return {
    symbol: meta.symbol ?? sym,
    price,
    currency: meta.currency ?? "USD",
    name: meta.shortName ?? sym,
    changePct: prev > 0 ? (price - prev) / prev * 100 : 0
  };
}
async function fetchYahooBulk(symbols) {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const out = {};
  const concurrency = 5;
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((s) => fetchYahooQuote(s).catch(() => null)));
    results.forEach((r, idx) => {
      if (r) out[batch[idx]] = r;
    });
  }
  return out;
}
async function fetchBoiFX() {
  const tickers = ["USD", "EUR", "GBP"];
  const results = await Promise.all(
    tickers.map(async (cur) => {
      try {
        const res = await fetch(`https://boi.org.il/PublicApi/GetExchangeRate?key=${cur}`, {
          headers: { "User-Agent": "PlanApp/1.0 (server-side)" }
        });
        if (!res.ok) return [cur, null];
        const data = await res.json();
        const rate = data?.currentExchangeRate;
        return [cur, typeof rate === "number" && rate > 0 ? rate : null];
      } catch {
        return [cur, null];
      }
    })
  );
  const out = { ILS: 1 };
  for (const [cur, rate] of results) if (rate) out[cur] = rate;
  return out;
}
async function fetchLiveFX() {
  const pairs = { USD: "USDILS=X", EUR: "EURILS=X", GBP: "GBPILS=X" };
  const boiFallback = await fetchBoiFX();
  const results = await Promise.all(
    Object.entries(pairs).map(async ([cur, symbol]) => {
      try {
        const quote = await fetchYahooQuote(symbol);
        const rate = quote?.price;
        return [cur, typeof rate === "number" && rate > 0 ? rate : boiFallback[cur]];
      } catch {
        return [cur, boiFallback[cur]];
      }
    })
  );
  const out = { ILS: 1 };
  for (const [cur, rate] of results) if (rate) out[cur] = rate;
  return out;
}
async function fetchHistoricalFX(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid_date");
  const currencies = ["USD", "EUR", "GBP"];
  const results = await Promise.all(
    currencies.map(async (cur) => {
      const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${cur}&symbols=ILS`, {
        headers: { "User-Agent": "PlanApp/1.0 (server-side)" }
      });
      if (!res.ok) return [cur, null];
      const data = await res.json();
      const rate = data?.rates?.ILS;
      return [cur, typeof rate === "number" && rate > 0 ? rate : null];
    })
  );
  const liveFallback = await fetchLiveFX();
  const out = { ILS: 1 };
  for (const [cur, rate] of results) out[cur] = rate ?? liveFallback[cur] ?? 0;
  return { date, rates: out };
}
var MACRO_FALLBACK = { boiRate: 0.0425, inflationRate: 0.025 };
async function fetchBoiInterestRate() {
  try {
    const res = await fetch("https://www.boi.org.il/PublicApi/GetInterest", {
      headers: { "User-Agent": "PlanApp/1.0 (server-side)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pct = typeof data?.currentInterest === "number" ? data.currentInterest : null;
    if (pct == null || pct < 0 || pct > 30) return null;
    return pct / 100;
  } catch {
    return null;
  }
}
async function fetchCbsInflation() {
  try {
    const res = await fetch("https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false", {
      headers: { "User-Agent": "PlanApp/1.0 (server-side)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const months = data?.month || data?.months;
    if (!Array.isArray(months) || months.length === 0) return null;
    const latest = months[months.length - 1];
    const yoyPct = typeof latest?.currPer_lastYearPercentageChange === "number" ? latest.currPer_lastYearPercentageChange : null;
    if (yoyPct == null || yoyPct < -10 || yoyPct > 50) return null;
    return yoyPct / 100;
  } catch {
    return null;
  }
}
async function fetchMacroSnapshot() {
  const [boiRateLive, inflationLive, fx] = await Promise.all([
    fetchBoiInterestRate(),
    fetchCbsInflation(),
    fetchBoiFX()
  ]);
  const boiRate = boiRateLive ?? MACRO_FALLBACK.boiRate;
  const inflationRate = inflationLive ?? MACRO_FALLBACK.inflationRate;
  const usd = fx.USD ?? null;
  return {
    boiRate,
    primeRate: boiRate + 0.015,
    inflationRate,
    usd,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: {
      boiRate: boiRateLive != null ? "live" : "fallback",
      inflation: inflationLive != null ? "live" : "fallback",
      usd: usd != null ? "live" : "fallback"
    }
  };
}
async function fetchCryptoBulk(coinIds) {
  const ids = coinIds.map((s) => s.trim().toLowerCase()).filter(Boolean).join(",");
  if (!ids) return [];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=ils,usd&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return coinIds.filter((id) => data[id.toLowerCase()] && typeof data[id.toLowerCase()].ils === "number").map((id) => ({
    symbol: id.toLowerCase(),
    price: data[id.toLowerCase()].ils,
    currency: "ILS",
    changePct: data[id.toLowerCase()].usd_24h_change ?? 0
  }));
}
async function fetchYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanApp/1.0)", Accept: "application/json" }
    });
    if (!res.ok) return { symbol, price: null, source: "error", error: `HTTP ${res.status}` };
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data?.chart?.result?.[0]?.meta?.currency;
    if (typeof price !== "number") return { symbol, price: null, source: "error", error: "no price in response" };
    return { symbol, price, currency, source: "yahoo" };
  } catch (e) {
    return { symbol, price: null, source: "error", error: e instanceof Error ? e.message : "fetch failed" };
  }
}
async function fetchCoinGecko(coinIds) {
  if (!coinIds.length) return {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd,ils`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
marketRouter.get(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const kind = String(req.query.kind || "");
    try {
      if (kind === "quote") {
        const sym = String(req.query.symbol || "").trim().toUpperCase();
        if (!sym) return res.status(400).json({ error: "missing symbol" });
        if (!KIND_SYMBOL_RE.test(sym)) return res.status(400).json({ error: "invalid symbol" });
        const data = await cached(`q:${sym}`, () => fetchYahooQuote(sym));
        return res.json(data ?? null);
      }
      if (kind === "quotes") {
        const symbols = String(req.query.symbols || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => KIND_SYMBOL_RE.test(s));
        if (symbols.length === 0) return res.json({});
        const capped = symbols.slice(0, 50);
        const key = `qs:${[...capped].sort().join(",")}`;
        const data = await cached(key, () => fetchYahooBulk(capped));
        return res.json(data);
      }
      if (kind === "fx") {
        return res.json(await fetchLiveFX());
      }
      if (kind === "fx-date") {
        const date = String(req.query.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "invalid date" });
        const data = await cached(`fx-date:${date}`, () => fetchHistoricalFX(date));
        return res.json(data);
      }
      if (kind === "macro") {
        const data = await cached("macro", () => fetchMacroSnapshot());
        return res.json(data);
      }
      if (kind === "crypto") {
        const ids = String(req.query.ids || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => COIN_ID_RE.test(s)).slice(0, 30);
        if (ids.length === 0) return res.json([]);
        const key = `c:${[...ids].sort().join(",")}`;
        const data = await cached(key, () => fetchCryptoBulk(ids));
        return res.json(data);
      }
      return res.status(400).json({ error: "unknown kind" });
    } catch (err) {
      console.error("[/api/market] error:", err);
      return res.status(500).json({ error: "fetch_failed" });
    }
  })
);
var SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
var CRYPTO_RE = /^[a-z0-9-]{1,40}$/;
var MAX_SYMBOLS = 50;
var MAX_CRYPTOS = 30;
marketRouter.get(
  "/prices",
  requireUser,
  asyncHandler(async (req, res) => {
    const symbols = String(req.query.symbols || "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => SYMBOL_RE.test(s)).slice(0, MAX_SYMBOLS);
    const cryptoIds = String(req.query.crypto || "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => CRYPTO_RE.test(s)).slice(0, MAX_CRYPTOS);
    if (symbols.length === 0 && cryptoIds.length === 0) {
      res.status(400).json({ error: "missing or invalid symbols/crypto param" });
      return;
    }
    const yahooResults = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      const r = await Promise.all(batch.map(fetchYahoo));
      yahooResults.push(...r);
    }
    const cryptoMap = await fetchCoinGecko(cryptoIds);
    res.json({ quotes: yahooResults, crypto: cryptoMap, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() });
  })
);
marketRouter.post(
  "/prices",
  (req, res) => {
    const isCron = !!req.headers["x-vercel-cron"];
    const authHeader = req.headers.authorization || "";
    const cronSecret = process.env.CRON_SECRET;
    const hasSecret = cronSecret ? authHeader === `Bearer ${cronSecret}` : false;
    if (!isCron && !hasSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    void env;
    res.json({
      ok: true,
      scheduledAt: (/* @__PURE__ */ new Date()).toISOString(),
      note: "stub \u2014 Supabase securities table pending; client refreshes on demand"
    });
  }
);

// src/server.ts
var app = express();
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use("/api/health", healthRouter);
app.use("/api/crm/invites", invitesRouter);
app.use("/api/crm/impersonate", impersonateRouter);
app.use("/api/crm", crmRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/sync", syncRouter);
app.use("/api/gcal", gcalRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/debt", debtRouter);
app.use("/api/categorize", categorizeRouter);
app.use("/api/merchant-category-rules", merchantCategoryRulesRouter);
app.use("/api/auth", authRouter);
app.use("/api/crypto", cryptoRouter);
app.use("/api/pension", pensionRouter);
app.use("/api/securities", securitiesRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/market", marketRouter);
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});
app.use((err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : "internal_error";
  console.error("[error]", err);
  res.status(500).json({ error: message });
});
try {
  assertSupabaseEnv();
} catch (e) {
  if (env.NODE_ENV === "production") throw e;
  console.warn(`[boot] \u26A0\uFE0F ${e.message} \u2014 auth routes will 401 until set.`);
}
app.listen(env.PORT, () => {
  console.log(`[plan-backend] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`[plan-backend] CORS origins: ${env.CORS_ORIGINS.join(", ")}`);
});
export {
  app
};
