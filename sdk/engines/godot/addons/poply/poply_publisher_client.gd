# SPDX-License-Identifier: Apache-2.0
class_name PoPLYPublisherClient
extends Node

signal request_completed(success: bool, status_code: int, body: Dictionary, error: String)

var _base_url: String
var _api_key: String
var _http: HTTPRequest
var _busy := false

func _init(base_url: String, api_key: String) -> void:
    assert(not base_url.is_empty(), "PoPLY base URL is required")
    assert(not api_key.is_empty(), "PoPLY publisher API key is required")
    _base_url = base_url.trim_suffix("/")
    _api_key = api_key

func _ready() -> void:
    _http = HTTPRequest.new()
    add_child(_http)
    _http.request_completed.connect(_on_request_completed)

func submit_checkpoint(payload: Dictionary) -> Error:
    return _post_json("/v1/checkpoints", payload)

func submit_achievement(payload: Dictionary) -> Error:
    return _post_json("/v1/achievements", payload)

func _post_json(path: String, payload: Dictionary) -> Error:
    if _busy:
        return ERR_BUSY
    var headers := PackedStringArray([
        "Content-Type: application/json",
        "Authorization: Bearer " + _api_key,
    ])
    var result := _http.request(
        _base_url + path,
        headers,
        HTTPClient.METHOD_POST,
        JSON.stringify(payload)
    )
    if result == OK:
        _busy = true
    return result

func _on_request_completed(
    result: int,
    response_code: int,
    _headers: PackedStringArray,
    body: PackedByteArray
) -> void:
    _busy = false
    var text := body.get_string_from_utf8()
    var parsed = JSON.parse_string(text)
    var response_body: Dictionary = parsed if parsed is Dictionary else {}
    var success := result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300
    # Surface the verifier's structured {error, message} body so integrators get the actionable
    # reason (e.g. a sequence conflict) instead of a generic failure string.
    var error := ""
    if not success:
        var code: String = str(response_body.get("error", ""))
        var message: String = str(response_body.get("message", ""))
        if code.is_empty() and message.is_empty():
            error = "PoPLY verifier request failed"
        elif message.is_empty():
            error = code
        else:
            error = code + ": " + message if not code.is_empty() else message
    request_completed.emit(success, response_code, response_body, error)
