# SPDX-License-Identifier: Apache-2.0
# Headless sample integration for the PoPLY publisher verifier. Exercises the poply addon's
# transport end to end: a first checkpoint must come back 201 with a signature, and replaying
# the same sequence must come back 409 with the structured sequence_conflict error. Exits 0 on
# success, 1 on any deviation — scripts/godot-e2e.sh reads the exit code.
extends Node

const GAME_ID := "0xa807d4d4c73f90fd24fd4dfb0a08e70a249e6c267fa0ad4f9a735d2ca1059393"
const CHARACTER := "0x1000000000000000000000000000000000000001"

var _client: PoPLYPublisherClient
var _phase := 0

func _ready() -> void:
    var base_url := OS.get_environment("POPLY_BASE_URL")
    var api_key := OS.get_environment("POPLY_PUBLISHER_API_KEY")
    if base_url.is_empty() or api_key.is_empty():
        _fail("POPLY_BASE_URL and POPLY_PUBLISHER_API_KEY are required")
        return
    _client = PoPLYPublisherClient.new(base_url, api_key)
    add_child(_client)
    _client.request_completed.connect(_on_completed)
    # A dedicated server would submit on its own cadence; the sample submits once at startup.
    get_tree().create_timer(20.0).timeout.connect(func() -> void: _fail("timed out"))
    _submit_checkpoint()

func _submit_checkpoint() -> void:
    var result := _client.submit_checkpoint({
        "characterContract": CHARACTER,
        "tokenId": "1",
        "gameId": GAME_ID,
        "sequence": "1",
        "state": {"level": 2, "wins": 1},
        "playTimeSeconds": "18000",
        "achievementCount": 1,
    })
    if result != OK:
        _fail("submit_checkpoint dispatch failed: %d" % result)

func _on_completed(success: bool, status_code: int, body: Dictionary, error: String) -> void:
    match _phase:
        0:
            if not success or status_code != 201:
                _fail("expected 201 signed checkpoint, got %d (%s)" % [status_code, error])
                return
            if not (body.get("signature", "") as String).begins_with("0x"):
                _fail("response is missing the verifier signature")
                return
            print("checkpoint signed by ", body.get("signer", "?"))
            _phase = 1
            _submit_checkpoint()
        1:
            # The replayed sequence must surface the structured conflict, not a generic failure.
            if success or status_code != 409:
                _fail("expected 409 sequence conflict, got %d" % status_code)
                return
            if not error.begins_with("sequence_conflict"):
                _fail("structured error lost, got: %s" % error)
                return
            print("sequence conflict surfaced correctly: ", error)
            get_tree().quit(0)

func _fail(message: String) -> void:
    push_error("PoPLY sample failed: " + message)
    get_tree().quit(1)
