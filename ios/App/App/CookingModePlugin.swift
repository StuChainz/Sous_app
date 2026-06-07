import AVFoundation
import Capacitor
import Speech
import UIKit

@objc(CookingModePlugin)
public class CookingModePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CookingModePlugin"
    public let jsName = "CookingMode"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCookingMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCookingMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "simulateWakeForDebug", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushPendingTranscripts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCookingModeState", returnType: CAPPluginReturnPromise)
    ]

    private enum CookingState: String {
        case idle
        case arming
        case wakeListening = "wake_listening"
        case commandListening = "command_listening"
        case transcribing
        case dispatching
        case interrupted
        case suspended
        case error
    }

    private var state: CookingState = .idle
    private var intendedActive = false
    private var echoCancellationDetail = "not_checked"
    private var wakeAudioEngine: AVAudioEngine?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var commandTimeoutTimer: Timer?
    private var commandCounter = 0
    private var activeCommandId: String?
    private var audioSessionActive = false
    private var jsBridgeReady = false
    private var isAppForeground = true
    private var pendingTranscripts: [[String: Any]] = []
    private var lastInterruptionReason = "none"
    private var lastRouteChange = "none"
    private var lastCommandId = ""
    private var lastCommandDeliveryStatus = "none"
    private var sessionStartedAt: Date?
    private let maxPendingTranscripts = 25

    public override func load() {
        isAppForeground = UIApplication.shared.applicationState == .active
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidEnterBackground(_:)),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppWillEnterForeground(_:)),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive(_:)),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(permissionPayload())
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        let group = DispatchGroup()

        group.enter()
        AVAudioSession.sharedInstance().requestRecordPermission { _ in
            group.leave()
        }

        group.enter()
        SFSpeechRecognizer.requestAuthorization { _ in
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve(self.permissionPayload())
        }
    }

    @objc func startCookingMode(_ call: CAPPluginCall) {
        jsBridgeReady = true
        let permissions = currentPermissions()
        guard permissions.microphone == "granted" else {
            emitRecoverableError("microphone_permission_denied", "Microphone permission is required for Cooking Mode.")
            call.reject("Microphone permission is required for Cooking Mode.", "microphone_permission_denied")
            return
        }

        intendedActive = true
        sessionStartedAt = Date()
        lastCommandDeliveryStatus = "session_starting"
        transition(to: .arming, event: "listening", extra: ["phase": "arming"])

        do {
            try configureAudioSession()
            try startWakeListening(reason: "start")
            call.resolve(statePayload())
        } catch {
            intendedActive = false
            resetCommandCapture(cancelTask: true)
            stopWakeListening()
            releaseAudioSession(reason: "start_failed")
            transition(to: .error, event: "error", extra: [
                "code": "audio_session_failed",
                "message": error.localizedDescription,
                "recoverable": true
            ])
            call.reject(error.localizedDescription, "audio_session_failed")
        }
    }

    @objc func stopCookingMode(_ call: CAPPluginCall) {
        jsBridgeReady = true
        stopCookingModeInternal(reason: "manual_stop")
        call.resolve(statePayload())
    }

    @objc func simulateWakeForDebug(_ call: CAPPluginCall) {
        jsBridgeReady = true
        guard intendedActive else {
            call.reject("Cooking Mode is not active.", "not_active")
            return
        }
        let delayMs = max(0, call.getInt("delayMs") ?? 0)
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs)) {
            guard self.intendedActive else { return }
            self.notifyListeners("wake", data: self.statePayload(["debug": true]))
            self.startCommandCapture(debug: true)
        }
        call.resolve(statePayload(["scheduledDelayMs": delayMs]))
    }

    @objc func flushPendingTranscripts(_ call: CAPPluginCall) {
        jsBridgeReady = true
        flushPendingTranscripts(reason: "js_flush")
        call.resolve(statePayload())
    }

    @objc func getCookingModeState(_ call: CAPPluginCall) {
        jsBridgeReady = true
        call.resolve(statePayload())
    }

    private func currentPermissions() -> (microphone: String, speech: String) {
        let microphone: String
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted:
            microphone = "granted"
        case .denied:
            microphone = "denied"
        case .undetermined:
            microphone = "prompt"
        @unknown default:
            microphone = "prompt"
        }

        let speech: String
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            speech = "granted"
        case .denied, .restricted:
            speech = "denied"
        case .notDetermined:
            speech = "prompt"
        @unknown default:
            speech = "prompt"
        }

        return (microphone, speech)
    }

    private func permissionPayload() -> [String: Any] {
        let permissions = currentPermissions()
        return [
            "microphone": permissions.microphone,
            "speechRecognition": permissions.speech
        ]
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .default,
            options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth]
        )

        echoCancellationDetail = "unavailable"
        if #available(iOS 18.2, *), session.isEchoCancelledInputAvailable {
            do {
                try session.setPrefersEchoCancelledInput(true)
                echoCancellationDetail = "enabled"
            } catch {
                echoCancellationDetail = "failed"
            }
        }

        try session.setActive(true)
        audioSessionActive = true
    }

    private func startWakeListening(reason: String) throws {
        guard intendedActive else { return }
        if wakeAudioEngine?.isRunning == true {
            transition(to: .wakeListening, event: "listening", extra: ["phase": "wake", "reason": reason])
            return
        }

        try configureAudioSession()

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { _, _ in
            // V1 has no wake-word SDK. This tap proves native mic ownership and background audio lifecycle.
        }

        engine.prepare()
        try engine.start()
        wakeAudioEngine = engine
        transition(to: .wakeListening, event: "listening", extra: ["phase": "wake", "reason": reason])
    }

    private func stopWakeListening() {
        guard let engine = wakeAudioEngine else { return }
        if engine.isRunning {
            engine.stop()
        }
        engine.inputNode.removeTap(onBus: 0)
        wakeAudioEngine = nil
    }

    private func startCommandCapture(debug: Bool) {
        guard intendedActive else { return }
        guard currentPermissions().speech == "granted" else {
            emitRecoverableError("speech_permission_denied", "Speech recognition permission is required for Cooking Mode.")
            return
        }

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en_GB")), recognizer.isAvailable else {
            emitRecoverableError("speech_recognition_unavailable", "On-device speech recognition is unavailable.")
            return
        }

        guard recognizer.supportsOnDeviceRecognition else {
            emitRecoverableError("on_device_speech_unavailable", "On-device speech recognition is unavailable.")
            return
        }

        resetCommandCapture(cancelTask: true)
        stopWakeListening()

        do {
            try configureAudioSession()

            let engine = AVAudioEngine()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = false
            request.requiresOnDeviceRecognition = true

            let inputNode = engine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }

            commandCounter += 1
            let commandId = "cooking-native-\(Int(Date().timeIntervalSince1970 * 1000))-\(commandCounter)"
            activeCommandId = commandId
            lastCommandId = commandId
            audioEngine = engine
            recognitionRequest = request

            transition(to: .commandListening, event: "listening", extra: [
                "phase": "command",
                "debug": debug,
                "commandId": commandId
            ])

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.handleRecognitionResult(result, error: error, commandId: commandId)
                }
            }

            engine.prepare()
            try engine.start()
            startCommandTimeout(commandId: commandId)
        } catch {
            resetCommandCapture(cancelTask: true)
            transition(to: .suspended, event: "suspended", extra: [
                "reason": "command_capture_failed",
                "message": error.localizedDescription
            ])
            resumeWakeListeningAfterCommand(reason: "command_capture_failed")
        }
    }

    private func resumeWakeListeningAfterCommand(reason: String) {
        guard intendedActive else { return }
        do {
            try startWakeListening(reason: reason)
        } catch {
            transition(to: .suspended, event: "suspended", extra: [
                "reason": "wake_resume_failed",
                "message": error.localizedDescription
            ])
        }
    }

    private func handleRecognitionResult(_ result: SFSpeechRecognitionResult?, error: Error?, commandId: String) {
        guard intendedActive, activeCommandId == commandId else { return }

        if let error = error {
            resetCommandCapture(cancelTask: false)
            transition(to: .suspended, event: "suspended", extra: [
                "reason": "recognition_cancelled",
                "message": error.localizedDescription
            ])
            resumeWakeListeningAfterCommand(reason: "recognition_cancelled")
            return
        }

        guard let result = result, result.isFinal else { return }
        let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
        resetCommandCapture(cancelTask: false)

        guard !transcript.isEmpty else {
            resumeWakeListeningAfterCommand(reason: "empty_transcript")
            return
        }

        transition(to: .transcribing, event: "listening", extra: ["phase": "transcribing", "commandId": commandId])
        enqueueOrDeliverTranscript([
            "id": commandId,
            "text": transcript,
            "source": "cooking_native",
            "isFinal": true
        ])
        if intendedActive {
            resumeWakeListeningAfterCommand(reason: "transcript_dispatched")
        }
    }

    private func startCommandTimeout(commandId: String) {
        commandTimeoutTimer?.invalidate()
        commandTimeoutTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.activeCommandId == commandId else { return }
                self.resetCommandCapture(cancelTask: true)
                self.resumeWakeListeningAfterCommand(reason: "command_timeout")
            }
        }
    }

    private func resetCommandCapture(cancelTask: Bool) {
        commandTimeoutTimer?.invalidate()
        commandTimeoutTimer = nil

        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            engine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()
        if cancelTask {
            recognitionTask?.cancel()
        }

        recognitionTask = nil
        recognitionRequest = nil
        audioEngine = nil
        activeCommandId = nil
    }

    private func stopCookingModeInternal(reason: String) {
        intendedActive = false
        resetCommandCapture(cancelTask: true)
        stopWakeListening()
        pendingTranscripts.removeAll()
        lastCommandDeliveryStatus = "stopped"
        releaseAudioSession(reason: reason)
        sessionStartedAt = nil
        transition(to: .idle, event: "stopped", extra: ["reason": reason])
    }

    private func releaseAudioSession(reason: String) {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            audioSessionActive = false
        } catch {
            notifyListeners("error", data: statePayload([
                "code": "audio_session_deactivate_failed",
                "message": error.localizedDescription,
                "recoverable": true
            ]))
        }
    }

    private func transition(to nextState: CookingState, event: String, extra: [String: Any] = [:]) {
        state = nextState
        notifyListeners(event, data: statePayload(extra))
    }

    private func enqueueOrDeliverTranscript(_ transcript: [String: Any]) {
        state = .dispatching
        lastCommandId = String((transcript["id"] as? String) ?? (transcript["commandId"] as? String) ?? lastCommandId)

        guard isAppForeground, jsBridgeReady else {
            if pendingTranscripts.count >= maxPendingTranscripts {
                pendingTranscripts.removeFirst()
                lastCommandDeliveryStatus = "dropped_oldest_then_queued"
            } else {
                lastCommandDeliveryStatus = isAppForeground ? "queued_js_not_ready" : "queued_background"
            }
            pendingTranscripts.append(transcript)
            notifyListeners("suspended", data: statePayload([
                "reason": lastCommandDeliveryStatus,
                "commandId": lastCommandId
            ]))
            return
        }

        lastCommandDeliveryStatus = "delivered"
        notifyListeners("transcript", data: statePayload(transcript))
    }

    private func flushPendingTranscripts(reason: String) {
        guard isAppForeground, jsBridgeReady else { return }
        if pendingTranscripts.isEmpty {
            lastCommandDeliveryStatus = "flush_empty"
            return
        }

        let queued = pendingTranscripts
        pendingTranscripts.removeAll()
        for transcript in queued {
            state = .dispatching
            lastCommandId = String((transcript["id"] as? String) ?? (transcript["commandId"] as? String) ?? lastCommandId)
            lastCommandDeliveryStatus = "delivered_after_\(reason)"
            notifyListeners("transcript", data: statePayload(transcript))
        }
    }

    private func statePayload(_ extra: [String: Any] = [:]) -> [String: Any] {
        let sessionDurationMs: Int
        if let sessionStartedAt {
            sessionDurationMs = max(0, Int(Date().timeIntervalSince(sessionStartedAt) * 1000))
        } else {
            sessionDurationMs = 0
        }
        var payload: [String: Any] = [
            "state": state.rawValue,
            "active": intendedActive,
            "echoCancellation": echoCancellationDetail,
            "wakeAudioActive": wakeAudioEngine?.isRunning == true,
            "commandAudioActive": audioEngine?.isRunning == true,
            "micAudioSessionActive": audioSessionActive,
            "audioSessionActive": audioSessionActive,
            "lastInterruptionReason": lastInterruptionReason,
            "lastRouteChange": lastRouteChange,
            "pendingTranscriptCount": pendingTranscripts.count,
            "lastCommandId": lastCommandId,
            "lastCommandDeliveryStatus": lastCommandDeliveryStatus,
            "sessionStartedAt": sessionStartedAt.map { iso8601String($0) } ?? "",
            "sessionDurationMs": sessionDurationMs
        ]
        extra.forEach { payload[$0.key] = $0.value }
        return payload
    }

    private func iso8601String(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func emitRecoverableError(_ code: String, _ message: String) {
        transition(to: .error, event: "error", extra: [
            "code": code,
            "message": message,
            "recoverable": true
        ])
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        guard intendedActive else { return }
        let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        let type = typeValue.flatMap { AVAudioSession.InterruptionType(rawValue: $0) }
        if type == .began {
            lastInterruptionReason = "began"
            resetCommandCapture(cancelTask: true)
            stopWakeListening()
            transition(to: .interrupted, event: "interrupted", extra: ["reason": "audio_session_interruption"])
        } else if type == .ended {
            lastInterruptionReason = "ended"
            resumeWakeListeningAfterCommand(reason: "interruption_ended")
        }
    }

    @objc private func handleAudioRouteChange(_ notification: Notification) {
        guard intendedActive else { return }
        let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        let reason = reasonValue.flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }
        lastRouteChange = routeChangeReasonName(reason)
        if reason == .oldDeviceUnavailable || reason == .categoryChange {
            transition(to: .suspended, event: "suspended", extra: ["reason": "audio_route_changed"])
            resetCommandCapture(cancelTask: true)
            stopWakeListening()
            resumeWakeListeningAfterCommand(reason: "audio_route_changed")
        }
    }

    private func routeChangeReasonName(_ reason: AVAudioSession.RouteChangeReason?) -> String {
        guard let reason else { return "unknown" }
        switch reason {
        case .unknown: return "unknown"
        case .newDeviceAvailable: return "new_device_available"
        case .oldDeviceUnavailable: return "old_device_unavailable"
        case .categoryChange: return "category_change"
        case .override: return "override"
        case .wakeFromSleep: return "wake_from_sleep"
        case .noSuitableRouteForCategory: return "no_suitable_route"
        case .routeConfigurationChange: return "route_configuration_change"
        @unknown default: return "unknown"
        }
    }

    @objc private func handleAppDidEnterBackground(_ notification: Notification) {
        isAppForeground = false
        jsBridgeReady = false
    }

    @objc private func handleAppWillEnterForeground(_ notification: Notification) {
        isAppForeground = true
    }

    @objc private func handleAppDidBecomeActive(_ notification: Notification) {
        isAppForeground = true
        if intendedActive {
            notifyListeners("listening", data: statePayload(["reason": "app_active"]))
        }
    }
}
