var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../../step18-managed-tools/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../../step18-managed-tools/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// ../../../workers/training-managed/owner-approval.mjs
import { DurableObject } from "cloudflare:workers";

// ../../../scripts/lib/training-mediated-dispatcher.mjs
import { createHash as createHash2 } from "node:crypto";

// ../../../scripts/lib/training-execution-contract.mjs
import { createHash } from "node:crypto";
var TRAINING_TARGET = Object.freeze({
  accountId: "2a3b96a0b37850cd03107131baa66b6d",
  project: "creatorloop-operator-training",
  projectId: "9863d88c-8025-414c-9524-078ee470e9e7",
  appId: "72da9ab5-d951-4de4-8456-fd6660e4d86e",
  databaseId: "12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0",
  audience: "a6b7d2d9e2a0bbe45ac1f1155cbd32593467eac2d66c01aa67d36fb290b7a38d",
  deploymentId: "9863d88c-8025-414c-9524-078ee470e9e7"
});
function refuse(code) {
  throw Error(code);
}
__name(refuse, "refuse");

// ../../../scripts/lib/training-github-environments.mjs
var TRAINING_REPOSITORY = "VTholdings/creatorloop-main-site";
var TRAINING_BRANCH = "team-access-directory";
var TRAINING_GITHUB_ENVIRONMENTS = Object.freeze({ provider: "creatorloop-training-provider-execution", release: "creatorloop-training-release" });

// ../../../scripts/lib/training-workload-policy.mjs
var WORKLOAD_POLICY_PROTOCOL = "CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2";
var isWorkloadPolicy = /* @__PURE__ */ __name((p) => p?.protocol === WORKLOAD_POLICY_PROTOCOL, "isWorkloadPolicy");

// ../../../scripts/lib/training-mediated-dispatcher.mjs
var TRANSFERRED_EXECUTOR_ACCOUNT = Object.freeze({ login: "kailuatester-del", id: 340701664 });
var DISPATCH_WORKFLOWS = Object.freeze({ provider: "step18-training-provider-workflow.yml", release: "step18-training-release-workflow.yml" });
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
__name(canonical, "canonical");
var dispatchHash = /* @__PURE__ */ __name((value) => createHash2("sha256").update(canonical(value)).digest("hex"), "dispatchHash");

// ../../../workers/training-managed/security.mjs
var bytes = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)), "bytes");
var enc = new TextEncoder();
var exact = /* @__PURE__ */ __name((value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...names].sort().join("|"), "exact");
function noRedirectFetch(fetchImpl) {
  return async (input, options = {}) => {
    const response = await fetchImpl(input, { ...options, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) refuse("MANAGED_REDIRECT_REFUSED");
    return response;
  };
}
__name(noRedirectFetch, "noRedirectFetch");
async function boundedJson(response, max = 65536) {
  if (!response.ok) refuse("MANAGED_REMOTE_READ_REFUSED");
  const reader = response.body?.getReader();
  if (!reader) refuse("MANAGED_BODY_REQUIRED");
  let size = 0, text = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > max) {
      await reader.cancel();
      refuse("MANAGED_BODY_TOO_LARGE");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
__name(boundedJson, "boundedJson");
async function keys(url, fetchImpl) {
  return (await boundedJson(await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(1e4) }))).keys;
}
__name(keys, "keys");
async function verifyJwt(token, { issuer, audience, jwks, now }) {
  if (typeof token !== "string" || token.length > 16384) refuse("BOUNDED_SIGNED_TOKEN_REQUIRED");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) refuse("SIGNED_TOKEN_REQUIRED");
  const header = JSON.parse(new TextDecoder().decode(bytes(parts[0]))), payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.jku || header.x5u || header.crit || payload.iss !== issuer || !(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(audience) || !Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now || payload.nbf !== void 0 && (!Number.isInteger(payload.nbf) || payload.nbf > now)) refuse("SIGNED_TOKEN_CLAIMS_REFUSED");
  const matches = (jwks || []).filter((k) => k.kid === header.kid);
  if (matches.length !== 1 || matches[0].kty !== "RSA" || ["d", "p", "q", "dp", "dq", "qi", "oth"].some((k) => Object.hasOwn(matches[0], k)) || !matches[0].n || bytes(matches[0].n).length < 256) refuse("EXACT_PUBLIC_VERIFICATION_KEY_REQUIRED");
  const key = await crypto.subtle.importKey("jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(parts[2]), enc.encode(parts[0] + "." + parts[1]))) refuse("SIGNED_TOKEN_SIGNATURE_REFUSED");
  return payload;
}
__name(verifyJwt, "verifyJwt");
async function accessPrincipal(token, c, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  const payload = await verifyJwt(token, { issuer: c.accessIssuer, audience: c.accessAudience, jwks: await keys(c.accessIssuer + "/cdn-cgi/access/certs", fetchImpl), now });
  if (isWorkloadPolicy(c.approvedExecutor)) {
    const service = c.identities.find((i) => i.role === "executor"), owner = c.identities.find((i) => i.role === "owner");
    if (payload.type === "app" && payload.sub === "" && !Object.hasOwn(payload, "email") && payload.common_name === service.clientId) return { role: "executor", id: c.approvedExecutor.account.id, login: c.approvedExecutor.account.login, authenticationRef: "access-service:" + dispatchHash({ clientId: payload.common_name, iat: payload.iat }), authenticatedAt: now };
    if (payload.type !== "app" || Object.hasOwn(payload, "common_name") || payload.sub !== owner.subject || payload.email !== owner.email) refuse("EXACT_OWNER_OR_WORKLOAD_TOKEN_REQUIRED");
    return { role: "owner", id: owner.githubId, authenticationRef: "access:" + dispatchHash({ sub: payload.sub, iat: payload.iat }), authenticatedAt: now };
  }
  const match = c.identities.find((i) => i.subject === payload.sub && i.email === payload.email);
  if (!match) refuse("INDIVIDUAL_MANAGED_IDENTITY_REQUIRED");
  return { role: match.role, id: match.githubId, login: match.role === "executor" ? c.approvedExecutor.account.login : void 0, authenticationRef: "access:" + dispatchHash({ sub: payload.sub, iat: payload.iat }), authenticatedAt: now };
}
__name(accessPrincipal, "accessPrincipal");
async function githubJob(token, c, lane, executionSha, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  if (!Object.hasOwn(DISPATCH_WORKFLOWS, lane)) refuse("EXACT_JOB_LANE_REQUIRED");
  const issuer = "https://token.actions.githubusercontent.com";
  const p = await verifyJwt(token, { issuer, audience: c.oidcAudience, jwks: await keys(issuer + "/.well-known/jwks", fetchImpl), now });
  const environment = lane === "provider" ? "creatorloop-training-provider-execution" : "creatorloop-training-release";
  const expectedWorkflow = `${TRAINING_REPOSITORY}/.github/workflows/${DISPATCH_WORKFLOWS[lane]}@refs/heads/${TRAINING_BRANCH}`;
  if (p.repository !== TRAINING_REPOSITORY || p.repository_id !== String(c.repositoryId) || p.repository_owner_id !== String(c.ownerId) || p.ref !== `refs/heads/${TRAINING_BRANCH}` || p.sha !== executionSha || p.workflow_sha !== executionSha || p.workflow_ref !== expectedWorkflow || p.event_name !== "workflow_dispatch" || p.run_attempt !== "1" || p.actor_id !== String(c.appBotId) || p.actor !== c.appBotLogin || p.runner_environment !== "github-hosted" || p.environment !== environment || typeof p.jti !== "string" || !p.jti || !/^\d+$/.test(p.run_id || "") || !Number.isSafeInteger(Number(p.run_id)) || Number(p.run_id) <= 0 || !Array.isArray(c.allowedOidcSubjects) || !c.allowedOidcSubjects.includes(p.sub) || p.exp - p.iat > 600) refuse("EXACT_PROTECTED_JOB_IDENTITY_REQUIRED");
  return { runId: p.run_id, jtiHash: dispatchHash(p.jti), expiresAt: p.exp, actorId: p.actor_id, lane };
}
__name(githubJob, "githubJob");

// ../../../scripts/lib/training-owner-approval-protocol.mjs
var OWNER_EVIDENCE_AUDIENCE = "CREATORLOOP_TRAINING_EVIDENCE";
var OWNER_READ_PURPOSES = ["commissioning", "dispatchApproval", "runApproval", "executionBundle", "providerApproval", "providerCapability", "providerScope", "currentRequest", "runtime", "session", "custodyExport"];
var exact2 = /* @__PURE__ */ __name((v, k) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === [...k].sort().join("|"), "exact");
var uuid = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v), "uuid");
function validateOwnerRead(read) {
  if (!exact2(read, ["protocol", "purpose", "query", "queryHash", "nonce"]) || read.protocol !== "CREATORLOOP_INDEPENDENT_READ_V1" || !OWNER_READ_PURPOSES.includes(read.purpose) || !uuid(read.nonce) || !read.query || typeof read.query !== "object" || Array.isArray(read.query) || read.queryHash !== dispatchHash(read.query) || JSON.stringify(read).length > 32768) refuse("EXACT_EXISTING_OWNER_READ_REQUIRED");
  return structuredClone(read);
}
__name(validateOwnerRead, "validateOwnerRead");
function validateOwnerPending(p, now) {
  if (!exact2(p, ["protocol", "environment", "id", "read", "actor", "createdAt", "expiresAt"]) || p.protocol !== "CREATORLOOP_OWNER_OUTBOUND_PENDING_V1" || p.environment !== "TRAINING" || !uuid(p.id) || !Number.isInteger(p.createdAt) || !Number.isInteger(p.expiresAt) || p.createdAt > now || p.expiresAt <= now || p.expiresAt - p.createdAt > 30 || !exact2(p.actor, ["role", "principalRef"]) || !["owner", "executor", "job", "metadata-reader"].includes(p.actor.role) || typeof p.actor.principalRef !== "string" || !p.actor.principalRef) refuse("BOUNDED_TRAINING_OWNER_PENDING_REQUIRED");
  validateOwnerRead(p.read);
  return structuredClone(p);
}
__name(validateOwnerPending, "validateOwnerPending");
function ownerPendingHash(p) {
  return dispatchHash(p);
}
__name(ownerPendingHash, "ownerPendingHash");

// ../../../scripts/lib/creatorloop-training-signer.mjs
import { webcrypto } from "node:crypto";
async function validatePublicVerifierKeys(keys2) {
  if (!Array.isArray(keys2) || !keys2.length || new Set(keys2.map((k) => k?.kid)).size !== keys2.length) refuse("PUBLIC_KEY_SET_REFUSED");
  const normalized = [];
  for (const k of keys2) {
    if (!k || typeof k.kid !== "string" || !k.kid || k.kty !== "RSA" || ["d", "p", "q", "dp", "dq", "qi", "oth"].some((f) => Object.hasOwn(k, f)) || !/^[A-Za-z0-9_-]+$/.test(k.n || "") || k.e !== "AQAB") refuse("PUBLIC_ONLY_RSA_KEY_REQUIRED");
    const modulus = Buffer.from(k.n, "base64url");
    if (modulus.length < 256 || BigInt("0x" + modulus.toString("hex")).toString(2).length < 2048) refuse("RSA_KEY_TOO_SMALL");
    const jwk = { kid: k.kid, kty: "RSA", n: k.n, e: k.e, alg: "RS256", key_ops: ["verify"], ext: true };
    try {
      await webcrypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    } catch {
      refuse("RSA_PUBLIC_IMPORT_FAILED");
    }
    normalized.push(jwk);
  }
  return normalized;
}
__name(validatePublicVerifierKeys, "validatePublicVerifierKeys");

// ../../../workers/training-managed/owner-approval-relay.mjs
var json = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), "json");
function createOwnerApprovalRelay({ fetchImpl = fetch, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now"), sleep = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "sleep") } = {}) {
  fetchImpl = noRedirectFetch(fetchImpl);
  return { async fetch(request, env2) {
    try {
      const c = JSON.parse(env2.OWNER_MAILBOX_CONFIG_JSON || "null");
      if (c?.protocol !== "CREATORLOOP_OWNER_OUTBOUND_MAILBOX_CONFIG_V1" || c.environment !== "TRAINING" || typeof c.origin !== "string" || !c.origin.startsWith("https://") || new URL(c.origin).origin !== c.origin || typeof c.issuer !== "string" || !c.issuer || !c.identityConfig || !Array.isArray(c.publicKeys) || !c.publicKeys.length || Object.keys(env2).some((k) => /PRIVATE_KEY|PROVIDER_TOKEN|DEPLOY_TOKEN|CLOUDFLARE_API_TOKEN/.test(k))) refuse("OWNER_PUBLIC_ONLY_MAILBOX_CONFIG_REQUIRED");
      const controls = c.identityConfig.workloadControls;
      if (c.origin === c.identityConfig.gatewayOrigin || typeof c.administrationRef !== "string" || !c.administrationRef || c.administrationRef !== controls?.approvalEvidenceCustodyRef || c.administrationRef === c.identityConfig.approvedExecutor?.workloadRef) refuse("OWNER_MAILBOX_SEPARATE_CUSTODY_REQUIRED");
      await validatePublicVerifierKeys(c.publicKeys);
      const url = new URL(request.url);
      if (url.origin !== c.origin || url.search || request.method !== "POST" || !["/v1/read", "/v1/owner/pending", "/v1/owner/respond", "/v1/owner/export"].includes(url.pathname)) return json({ error: "Owner mailbox route refused" }, 404);
      const body = await boundedJson(new Response(request.body, { status: 200 }), 32768);
      const accessToken = request.headers.get("Cf-Access-Jwt-Assertion"), jobToken = request.headers.get("Authorization")?.replace(/^Bearer /, "");
      const state = env2.MAILBOX_STATE.get(env2.MAILBOX_STATE.idFromName("creatorloop-training-owner-mailbox-v1"));
      if (url.pathname.startsWith("/v1/owner/")) {
        const principal = await accessPrincipal(accessToken, c.identityConfig, { fetchImpl, now: now() });
        if (principal.role !== "owner" || principal.id !== c.identityConfig.approvedExecutor.reviewerId) refuse("OWNER_ONLY_MAILBOX_OPERATION");
        if (url.pathname === "/v1/owner/pending") {
          if (!exact(body, [])) refuse("EMPTY_OWNER_POLL_REQUIRED");
          return json({ pending: await state.pending() });
        }
        if (url.pathname === "/v1/owner/export") {
          if (!exact(body, [])) refuse("EMPTY_OWNER_EXPORT_REQUIRED");
          return json(await state.exportCustody());
        }
        if (!exact(body, ["id", "jws"])) refuse("EXACT_OWNER_RESPONSE_REQUIRED");
        const pending2 = await state.request(body.id), proof = await verifyJwt(body.jws, { issuer: c.issuer, audience: OWNER_EVIDENCE_AUDIENCE, jwks: c.publicKeys, now: now() });
        if (proof.pendingHash !== ownerPendingHash(pending2) || proof.purpose !== pending2.read.purpose || proof.nonce !== pending2.read.nonce || proof.queryHash !== pending2.read.queryHash || proof.exp - proof.iat > 300 || proof.iat < now() - 300 || !Object.hasOwn(proof, "value") || typeof proof.ownerDecisionRef !== "string" || !proof.ownerDecisionRef) refuse("EXACT_MAC_SIGNED_OWNER_RESPONSE_REQUIRED");
        return json(await state.complete({ id: pending2.id, pendingHash: ownerPendingHash(pending2), jws: body.jws }));
      }
      const read = validateOwnerRead(body);
      let actor;
      if (accessToken) {
        const p = await accessPrincipal(accessToken, c.identityConfig, { fetchImpl, now: now() });
        actor = { role: p.role, principalRef: "github:" + p.id };
      } else if (jobToken) {
        const hints = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jobToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (x) => x.charCodeAt(0))));
        const lane = Object.keys(DISPATCH_WORKFLOWS).find((l) => String(hints.workflow_ref || "").includes("/" + DISPATCH_WORKFLOWS[l] + "@"));
        const sha = c.identityConfig.workloadControls?.expectedSourceSha;
        const job = await githubJob(jobToken, c.identityConfig, lane, sha, { fetchImpl, now: now() });
        actor = { role: "job", principalRef: "github-run:" + job.runId };
      } else if (["commissioning", "runApproval", "runtime"].includes(read.purpose)) actor = { role: "metadata-reader", principalRef: "unauthenticated-no-authorization" };
      else refuse("AUTHENTICATED_OWNER_READ_REQUIRED");
      const pending = await state.enqueue({ read, actor });
      for (let i = 0; i < 18; i++) {
        const response = await state.response(pending.id);
        if (response) return json(response);
        await sleep(400);
      }
      return json({ error: "Owner Mac did not return a signed response in time; execution held" }, 503);
    } catch {
      return json({ error: "Owner evidence mailbox refused" }, 403);
    }
  } };
}
__name(createOwnerApprovalRelay, "createOwnerApprovalRelay");

// ../../../workers/training-managed/owner-approval-state.mjs
function createOwnerApprovalState({ sql, transactionSync, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  if (!sql || typeof transactionSync !== "function") refuse("OWNER_MAILBOX_STORAGE_REQUIRED");
  sql.exec(`CREATE TABLE IF NOT EXISTS owner_pending(id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, body TEXT NOT NULL, body_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_responses(id TEXT PRIMARY KEY, pending_hash TEXT NOT NULL, jws TEXT NOT NULL, response_hash TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS owner_pending_no_update BEFORE UPDATE ON owner_pending BEGIN SELECT RAISE(ABORT,'Immutable Owner request'); END;
 CREATE TRIGGER IF NOT EXISTS owner_pending_no_delete BEFORE DELETE ON owner_pending BEGIN SELECT RAISE(ABORT,'Immutable Owner request'); END;
 CREATE TRIGGER IF NOT EXISTS owner_responses_no_update BEFORE UPDATE ON owner_responses BEGIN SELECT RAISE(ABORT,'Immutable Owner response'); END;
 CREATE TRIGGER IF NOT EXISTS owner_responses_no_delete BEFORE DELETE ON owner_responses BEGIN SELECT RAISE(ABORT,'Immutable Owner response'); END;`);
  const rows = /* @__PURE__ */ __name((s, ...args) => sql.exec(s, ...args).toArray(), "rows");
  return {
    async enqueue({ read, actor }) {
      validateOwnerRead(read);
      const t = now();
      return transactionSync(() => {
        if (rows("SELECT 1 FROM owner_pending WHERE nonce=?", read.nonce).length) refuse("OWNER_READ_NONCE_REPLAY");
        if (rows("SELECT COUNT(*) AS n FROM owner_pending WHERE expires_at>? AND id NOT IN(SELECT id FROM owner_responses)", t)[0].n >= 100) refuse("OWNER_MAILBOX_CAPACITY_REFUSED");
        const pending = { protocol: "CREATORLOOP_OWNER_OUTBOUND_PENDING_V1", environment: "TRAINING", id: crypto.randomUUID(), read, actor, createdAt: t, expiresAt: t + 30 };
        validateOwnerPending(pending, t);
        sql.exec("INSERT INTO owner_pending VALUES(?,?,?,?,?)", pending.id, read.nonce, JSON.stringify(pending), ownerPendingHash(pending), pending.expiresAt);
        return pending;
      });
    },
    async pending() {
      return rows("SELECT body FROM owner_pending WHERE expires_at>? AND id NOT IN(SELECT id FROM owner_responses) ORDER BY rowid LIMIT 20", now()).map((r) => JSON.parse(r.body));
    },
    async request(id) {
      const r = rows("SELECT body FROM owner_pending WHERE id=?", id)[0];
      if (!r) refuse("OWNER_PENDING_NOT_FOUND");
      return JSON.parse(r.body);
    },
    async complete({ id, pendingHash, jws }) {
      return transactionSync(() => {
        const row = rows("SELECT body,body_hash,expires_at FROM owner_pending WHERE id=?", id)[0];
        if (!row || row.body_hash !== pendingHash || row.expires_at <= now() || typeof jws !== "string" || jws.length > 16384) refuse("OWNER_COMPLETION_BOUND_OR_FRESHNESS_REFUSED");
        if (rows("SELECT 1 FROM owner_responses WHERE id=?", id).length) refuse("OWNER_COMPLETION_REPLAY_REFUSED");
        const responseHash = dispatchHash(jws);
        sql.exec("INSERT INTO owner_responses VALUES(?,?,?,?)", id, pendingHash, jws, responseHash);
        return { id, pendingHash, responseHash };
      });
    },
    async response(id) {
      const r = rows("SELECT jws FROM owner_responses WHERE id=?", id)[0];
      return r ? { jws: r.jws } : null;
    },
    async exportCustody() {
      return transactionSync(() => {
        const payload = { protocol: "CREATORLOOP_OWNER_MAILBOX_CUSTODY_V1", environment: "TRAINING", observedAt: now(), pending: rows("SELECT * FROM owner_pending ORDER BY rowid"), responses: rows("SELECT * FROM owner_responses ORDER BY rowid") };
        return { ...payload, snapshotHash: dispatchHash(payload) };
      });
    }
  };
}
__name(createOwnerApprovalState, "createOwnerApprovalState");

// ../../../workers/training-managed/owner-approval.mjs
var OwnerApprovalMailbox = class extends DurableObject {
  static {
    __name(this, "OwnerApprovalMailbox");
  }
  constructor(ctx, env2) {
    super(ctx, env2);
    this.ctx = ctx;
    this.store = createOwnerApprovalState({ sql: ctx.storage.sql, transactionSync: /* @__PURE__ */ __name((fn) => ctx.storage.transactionSync(fn), "transactionSync") });
  }
  enqueue(value) {
    return this.store.enqueue(value);
  }
  pending() {
    return this.store.pending();
  }
  request(id) {
    return this.store.request(id);
  }
  complete(value) {
    return this.store.complete(value);
  }
  response(id) {
    return this.store.response(id);
  }
  exportCustody() {
    return this.store.exportCustody();
  }
};
var owner_approval_default = createOwnerApprovalRelay();
export {
  OwnerApprovalMailbox,
  owner_approval_default as default
};
//# sourceMappingURL=owner-approval.js.map
