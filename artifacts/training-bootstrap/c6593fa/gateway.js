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
var WORKLOAD_EXCEPTION_DECISION = "VT-OWNER-2026-10-10-164433-HST";
var WORKLOAD_POLICY_PROTOCOL = "CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2";
var reference = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(v), "reference");
var exact = /* @__PURE__ */ __name((v, fields) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === [...fields].sort().join("|"), "exact");
var isWorkloadPolicy = /* @__PURE__ */ __name((p) => p?.protocol === WORKLOAD_POLICY_PROTOCOL, "isWorkloadPolicy");
function validateWorkloadPolicy(p) {
  if (!exact(p, ["protocol", "environment", "repository", "branch", "account", "reviewerId", "workloadRef", "signerCustodianRef", "exceptionDecisionRef", "ownerOverrideRiskAccepted", "separationControlsRef"]) || p.protocol !== WORKLOAD_POLICY_PROTOCOL || p.environment !== "TRAINING" || p.repository !== "VTholdings/creatorloop-main-site" || p.branch !== "team-access-directory" || !exact(p.account, ["login", "id"]) || !Number.isSafeInteger(p.account.id) || p.account.id <= 0 || typeof p.account.login !== "string" || !/^[-A-Za-z0-9]+\[bot\]$/.test(p.account.login) || !Number.isSafeInteger(p.reviewerId) || p.reviewerId <= 0 || p.reviewerId === p.account.id || !reference(p.workloadRef) || !reference(p.signerCustodianRef) || p.workloadRef === p.signerCustodianRef || p.exceptionDecisionRef !== WORKLOAD_EXCEPTION_DECISION || p.ownerOverrideRiskAccepted !== true || !reference(p.separationControlsRef)) refuse("EXACT_OWNER_APPROVED_TRAINING_WORKLOAD_POLICY_REQUIRED");
  return structuredClone(p);
}
__name(validateWorkloadPolicy, "validateWorkloadPolicy");

// ../../../scripts/lib/training-mediated-dispatcher.mjs
var TRANSFERRED_EXECUTOR_ACCOUNT = Object.freeze({ login: "kailuatester-del", id: 340701664 });
var DISPATCH_WORKFLOWS = Object.freeze({ provider: "step18-training-provider-workflow.yml", release: "step18-training-release-workflow.yml" });
var hex = /* @__PURE__ */ __name((value, size) => typeof value === "string" && new RegExp(`^[a-f0-9]{${size}}$`).test(value), "hex");
var id = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value), "id");
var reference2 = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value), "reference");
var keys = /* @__PURE__ */ __name((value, expected) => value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join("|") === [...expected].sort().join("|"), "keys");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
__name(canonical, "canonical");
var dispatchHash = /* @__PURE__ */ __name((value) => createHash2("sha256").update(canonical(value)).digest("hex"), "dispatchHash");
function validateApprovedExecutorPolicy(policy) {
  if (isWorkloadPolicy(policy)) return validateWorkloadPolicy(policy);
  if (!keys(policy, ["protocol", "account", "reviewerId", "humanCustodianRef", "signerCustodianRef", "separationEvidenceRef"]) || policy.protocol !== "CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1" || !keys(policy.account, ["login", "id"]) || !Number.isSafeInteger(policy.account.id) || policy.account.id <= 0 || typeof policy.account.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(policy.account.login) || !Number.isSafeInteger(policy.reviewerId) || policy.reviewerId <= 0 || policy.account.id === policy.reviewerId || !reference2(policy.humanCustodianRef) || !reference2(policy.signerCustodianRef) || policy.humanCustodianRef === policy.signerCustodianRef || !reference2(policy.separationEvidenceRef)) refuse("REVIEWED_INDEPENDENT_EXECUTOR_POLICY_REQUIRED");
  return structuredClone(policy);
}
__name(validateApprovedExecutorPolicy, "validateApprovedExecutorPolicy");
function validateDispatchRequest(request) {
  if (!keys(request, ["dispatchId", "decisionRef", "lane", "executionSha", "inputs"]) || !id(request.dispatchId) || !reference2(request.decisionRef) || !Object.hasOwn(DISPATCH_WORKFLOWS, request.lane) || !hex(request.executionSha, 40)) refuse("EXACT_TRAINING_DISPATCH_REQUEST_REQUIRED");
  const fields = request.lane === "provider" ? ["intended_operation", "owner_decision_ref", "owner_reviewer_id", "approved_port_sha256"] : ["application_sha", "configuration_hash", "owner_decision_ref", "owner_reviewer_id", "approved_port_sha256"];
  if (!keys(request.inputs, fields) || Object.values(request.inputs).some((v) => typeof v !== "string") || request.inputs.owner_decision_ref !== request.decisionRef || !/^[1-9]\d{0,14}$/.test(request.inputs.owner_reviewer_id) || !hex(request.inputs.approved_port_sha256, 64)) refuse("EXACT_APPROVED_WORKFLOW_INPUTS_REQUIRED");
  if (request.lane === "provider" && !["ADMIT", "REVOKE"].includes(request.inputs.intended_operation)) refuse("TRAINING_OPERATION_REFUSED");
  if (request.lane === "release" && (!hex(request.inputs.application_sha, 40) || !hex(request.inputs.configuration_hash, 64))) refuse("EXACT_RELEASE_BINDING_REQUIRED");
  return structuredClone(request);
}
__name(validateDispatchRequest, "validateDispatchRequest");

// ../../../workers/training-managed/workload-controls.mjs
var WORKLOAD_RESOURCES = ["creatorloop-training-execution-gateway", "creatorloop-training-execution-capability"];
function validateWorkloadControls(plan, policy) {
  validateWorkloadPolicy(policy);
  if (plan?.protocol !== "CREATORLOOP_TRAINING_WORKLOAD_CONTROLS_V1" || plan.environment !== "TRAINING" || plan.accountId !== "2a3b96a0b37850cd03107131baa66b6d" || !Array.isArray(plan.workers) || [...plan.workers].sort().join("|") !== [...WORKLOAD_RESOURCES].sort().join("|") || plan.repository !== "VTholdings/creatorloop-main-site" || plan.branch !== "team-access-directory" || plan.releaseEnvironment !== "creatorloop-training-release" || plan.preventSelfReview !== true || plan.allowAdminBypass !== false || plan.ownerReviewerId !== policy.reviewerId || plan.deploymentCredentialScope !== "selected-workers-editor" || plan.runtimeManagementCredentials !== false || plan.runtimeApprovalSigningCredentials !== false || plan.automaticCloudflareBuilds !== false || plan.alternateDeploymentCredentials !== false || plan.capabilityPublicRoute !== false || plan.ownerOverrideRiskAccepted !== true || plan.freezePrivilegedChangesWhenCommissioningExpires !== true || typeof plan.expectedSourceSha !== "string" || !/^[a-f0-9]{40}$/.test(plan.expectedSourceSha) || ["ownerOverrideAuditRef", "configVersionReconciliationRef", "vtRecoveryCopyRef", "approvalEvidenceCustodyRef"].some((k) => typeof plan[k] !== "string" || !plan[k].trim())) refuse("EXACT_TRAINING_OVERRIDE_MITIGATION_PLAN_REQUIRED");
  return { planValid: true, effectiveCloudflareControlsVerified: false, protectedExecutionAuthorized: false };
}
__name(validateWorkloadControls, "validateWorkloadControls");
function refuseRuntimeManagementBindings(env2, c) {
  if (!isWorkloadPolicy(c.approvedExecutor)) return;
  const forbidden = /(CLOUDFLARE.*(?:TOKEN|KEY)|DEPLOY.*(?:TOKEN|KEY)|WRANGLER.*(?:TOKEN|KEY)|EVIDENCE.*PRIVATE.*KEY|APPROVAL.*PRIVATE.*KEY|ADMISSION.*PRIVATE.*KEY)/i;
  if (Object.keys(env2).some((k) => forbidden.test(k))) refuse("RUNTIME_MANAGEMENT_OR_SIGNING_BINDING_REFUSED");
}
__name(refuseRuntimeManagementBindings, "refuseRuntimeManagementBindings");

// ../../../workers/training-managed/security.mjs
var bytes = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)), "bytes");
var enc = new TextEncoder();
var exact2 = /* @__PURE__ */ __name((value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...names].sort().join("|"), "exact");
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
function configuration(env2) {
  const c = JSON.parse(env2.MANAGED_CONFIG_JSON || "null");
  if (!["CREATORLOOP_MANAGED_TRAINING_V1", "CREATORLOOP_MANAGED_TRAINING_V2"].includes(c?.protocol) || c.environment !== "TRAINING" || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.accessIssuer || "") || typeof c.accessAudience !== "string" || !c.accessAudience || !Array.isArray(c.identities) || c.identities.length !== 2 || !Number.isSafeInteger(c.appId) || c.appId <= 0 || !Number.isSafeInteger(c.installationId) || c.installationId <= 0 || !Number.isSafeInteger(c.repositoryId) || c.repositoryId <= 0 || !Number.isSafeInteger(c.ownerId) || c.ownerId <= 0 || !Number.isSafeInteger(c.appBotId) || c.appBotId <= 0 || typeof c.appBotLogin !== "string" || !c.appBotLogin.endsWith("[bot]") || typeof c.gatewayOrigin !== "string" || new URL(c.gatewayOrigin).origin !== c.gatewayOrigin || !c.gatewayOrigin.startsWith("https://")) refuse("EXACT_MANAGED_COMMISSIONING_CONFIG_REQUIRED");
  validateApprovedExecutorPolicy(c.approvedExecutor);
  if (c.protocol === "CREATORLOOP_MANAGED_TRAINING_V2") {
    validateWorkloadControls(c.workloadControls, c.approvedExecutor);
    const owner = c.identities.find((i) => i.role === "owner"), service = c.identities.find((i) => i.role === "executor");
    if (!isWorkloadPolicy(c.approvedExecutor) || c.approvedExecutor.account.id !== c.appBotId || c.approvedExecutor.account.login !== c.appBotLogin || !exact2(owner, ["role", "subject", "email", "githubId"]) || typeof owner.subject !== "string" || !owner.subject || typeof owner.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email) || owner.email !== owner.email.toLowerCase() || owner.githubId !== c.approvedExecutor.reviewerId || !exact2(service, ["role", "type", "clientId", "githubId"]) || service.type !== "access-service-token" || typeof service.clientId !== "string" || !/^[a-f0-9]{32}\.access$/.test(service.clientId) || service.githubId !== c.appBotId || owner.subject === service.clientId) refuse("EXACT_CONSTRAINED_WORKLOAD_IDENTITY_REQUIRED");
  } else {
    if (isWorkloadPolicy(c.approvedExecutor)) refuse("WORKLOAD_REQUIRES_EXPLICIT_V2_CONFIG");
    if (c.approvedExecutor.account.id !== TRANSFERRED_EXECUTOR_ACCOUNT.id || c.approvedExecutor.account.login !== TRANSFERRED_EXECUTOR_ACCOUNT.login) refuse("EXACT_TRANSFERRED_EXECUTOR_REQUIRED");
    for (const role of ["owner", "executor"]) {
      const identity = c.identities.find((i) => i.role === role);
      if (!identity || typeof identity.subject !== "string" || !identity.subject || typeof identity.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) || identity.email !== identity.email.toLowerCase() || identity.githubId !== (role === "owner" ? c.approvedExecutor.reviewerId : c.approvedExecutor.account.id)) refuse("ACTUAL_MANAGED_IDENTITY_MAPPING_REQUIRED");
    }
    if (c.identities[0].subject === c.identities[1].subject || c.identities[0].email === c.identities[1].email) refuse("MANAGED_IDENTITY_SEPARATION_REQUIRED");
  }
  if (typeof c.oidcAudience !== "string" || !c.oidcAudience || c.oidcAudience === c.accessAudience) refuse("DEDICATED_JOB_AUDIENCE_REQUIRED");
  return c;
}
__name(configuration, "configuration");
async function keys2(url, fetchImpl) {
  return (await boundedJson(await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(1e4) }))).keys;
}
__name(keys2, "keys");
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
  const payload = await verifyJwt(token, { issuer: c.accessIssuer, audience: c.accessAudience, jwks: await keys2(c.accessIssuer + "/cdn-cgi/access/certs", fetchImpl), now });
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
  const p = await verifyJwt(token, { issuer, audience: c.oidcAudience, jwks: await keys2(issuer + "/.well-known/jwks", fetchImpl), now });
  const environment = lane === "provider" ? "creatorloop-training-provider-execution" : "creatorloop-training-release";
  const expectedWorkflow = `${TRAINING_REPOSITORY}/.github/workflows/${DISPATCH_WORKFLOWS[lane]}@refs/heads/${TRAINING_BRANCH}`;
  if (p.repository !== TRAINING_REPOSITORY || p.repository_id !== String(c.repositoryId) || p.repository_owner_id !== String(c.ownerId) || p.ref !== `refs/heads/${TRAINING_BRANCH}` || p.sha !== executionSha || p.workflow_sha !== executionSha || p.workflow_ref !== expectedWorkflow || p.event_name !== "workflow_dispatch" || p.run_attempt !== "1" || p.actor_id !== String(c.appBotId) || p.actor !== c.appBotLogin || p.runner_environment !== "github-hosted" || p.environment !== environment || typeof p.jti !== "string" || !p.jti || !/^\d+$/.test(p.run_id || "") || !Number.isSafeInteger(Number(p.run_id)) || Number(p.run_id) <= 0 || !Array.isArray(c.allowedOidcSubjects) || !c.allowedOidcSubjects.includes(p.sub) || p.exp - p.iat > 600) refuse("EXACT_PROTECTED_JOB_IDENTITY_REQUIRED");
  return { runId: p.run_id, jtiHash: dispatchHash(p.jti), expiresAt: p.exp, actorId: p.actor_id, lane };
}
__name(githubJob, "githubJob");

// ../../../workers/training-managed/custody-export.mjs
var CUSTODY_BODY_LIMIT = 32 * 1024 * 1024;

// ../../../workers/training-managed/gateway.mjs
var json = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), "json");
function createGateway({ fetchImpl = fetch, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") } = {}) {
  fetchImpl = noRedirectFetch(fetchImpl);
  return { async fetch(request, env2) {
    try {
      const c = configuration(env2), url = new URL(request.url);
      refuseRuntimeManagementBindings(env2, c);
      if (url.origin !== c.gatewayOrigin || url.search || request.method !== "POST" || !["/v1/approve", "/v1/dispatch", "/v1/run-check", "/v1/provider", "/v1/custody/export"].includes(url.pathname)) return json({ error: "Managed TRAINING route not found" }, 404);
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
      const body = await boundedJson(new Response(request.body, { status: 200 }), 32768);
      const human = ["/v1/approve", "/v1/dispatch", "/v1/custody/export"].includes(url.pathname);
      let token;
      if (human) {
        const workloadDispatch = url.pathname === "/v1/dispatch" && isWorkloadPolicy(c.approvedExecutor);
        if (workloadDispatch ? request.headers.has("Origin") : request.headers.get("Origin") !== c.gatewayOrigin) return json({ error: "Origin rejected" }, 403);
        token = request.headers.get("Cf-Access-Jwt-Assertion");
        const principal = await accessPrincipal(token, c, { fetchImpl, now: now() });
        if (principal.role !== (url.pathname === "/v1/dispatch" ? "executor" : "owner")) return json({ error: "Role rejected" }, 403);
        if (url.pathname !== "/v1/custody/export") validateDispatchRequest(url.pathname === "/v1/approve" ? body.request : body);
      } else {
        token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
        await githubJob(token, c, body.lane, body.executionSha, { fetchImpl, now: now() });
      }
      if (typeof env2.CAPABILITY?.fetch !== "function") return json({ error: "Private capability service not commissioned" }, 503);
      const result = await env2.CAPABILITY.fetch(new Request("https://private.invalid" + url.pathname, { method: "POST", headers: { "Content-Type": "application/json", ...human ? { "Cf-Access-Jwt-Assertion": token } : { Authorization: "Bearer " + token } }, body: JSON.stringify(body) }));
      const value = await boundedJson(result, url.pathname === "/v1/custody/export" ? CUSTODY_BODY_LIMIT : 32768);
      return json(value, result.status);
    } catch {
      return json({ error: "Managed TRAINING request refused; no automatic retry" }, 403);
    }
  } };
}
__name(createGateway, "createGateway");
var gateway_default = createGateway();
export {
  createGateway,
  gateway_default as default
};
//# sourceMappingURL=gateway.js.map
