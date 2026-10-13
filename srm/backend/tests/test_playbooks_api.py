from fastapi.testclient import TestClient


def test_api_playbook_lifecycle_and_execution(client: TestClient):
    # 1. Create a draft recovery playbook
    payload = {
        "playbook_id": "pb_auth_failover_api",
        "name": "Auth Failure Isolation & Ping",
        "description": "Opens circuit breaker and alerts ops team on repeated 5xx auth crash",
        "pattern_ref": "pat_auth_5xx",
        "applicable_services": ["auth-service"],
        "applicable_journeys": ["e_commerce_checkout"],
        "trigger_conditions": {"service_name": "auth-service"},
        "recovery_strategy": "circuit_break",
        "max_attempts": 3,
        "cooldown_seconds": 60,
        "verification_conditions": {"health_status": "healthy"},
        "rollback_instructions": {"action": "close_circuit_breaker"},
        "actions": [
            {
                "action_order": 1,
                "action_type": "circuit_breaker_toggle",
                "parameters": {
                    "service_name": "auth-service",
                    "target_state": "open",
                    "reason": "Repeated 5xx failure isolation",
                },
                "risk_level": "medium",
                "preconditions": {},
                "expected_outcome": "Circuit open",
                "timeout_seconds": 15,
                "requires_approval": False,
            },
            {
                "action_order": 2,
                "action_type": "send_notification",
                "parameters": {
                    "channel": "slack_webhook_dev",
                    "message": "Auth circuit breaker opened due to recurring errors",
                },
                "risk_level": "low",
                "preconditions": {},
                "expected_outcome": "Ops notified",
                "timeout_seconds": 10,
                "requires_approval": False,
            },
        ],
    }

    create_res = client.post("/api/v1/playbooks", json=payload)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["playbook_id"] == "pb_auth_failover_api"
    assert created["approval_status"] == "draft"
    assert created["is_enabled"] is False
    assert len(created["actions"]) == 2

    playbook_id = created["playbook_id"]

    # 2. List playbooks
    list_res = client.get("/api/v1/playbooks")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1

    # 3. Filter by service
    filtered_res = client.get("/api/v1/playbooks?service_name=auth-service")
    assert filtered_res.status_code == 200
    assert filtered_res.json()["total"] >= 1

    # 4. Get details
    get_res = client.get(f"/api/v1/playbooks/{playbook_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Auth Failure Isolation & Ping"

    # 5. Validate playbook
    val_res = client.post(f"/api/v1/playbooks/{playbook_id}/validate")
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["is_valid"] is True
    assert len(val_data["validation_errors"]) == 0

    # 6. Try to enable draft playbook (Must be rejected!)
    toggle_draft_res = client.patch(
        f"/api/v1/playbooks/{playbook_id}/toggle",
        json={"is_enabled": True},
    )
    assert toggle_draft_res.status_code == 400
    assert "Only approved playbooks can be enabled" in toggle_draft_res.json()["error"]["message"]

    # 7. Test in simulation mode
    sim_res = client.post(
        f"/api/v1/playbooks/{playbook_id}/simulate",
        json={"is_simulation": True},
    )
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["status"] == "simulated"
    assert sim_data["is_simulation"] is True

    # 8. Submit for approval
    submit_res = client.post(f"/api/v1/playbooks/{playbook_id}/submit")
    assert submit_res.status_code == 200
    assert submit_res.json()["approval_status"] == "pending_approval"

    # 9. Approve playbook
    approve_res = client.post(
        f"/api/v1/playbooks/{playbook_id}/approve",
        json={"status": "approved", "notes": "Approved by Infrastructure Lead"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["approval_status"] == "approved"

    # 10. Enable approved playbook
    enable_res = client.patch(
        f"/api/v1/playbooks/{playbook_id}/toggle",
        json={"is_enabled": True},
    )
    assert enable_res.status_code == 200
    assert enable_res.json()["is_enabled"] is True

    # 11. Execute playbook live
    exec_res = client.post(
        f"/api/v1/playbooks/{playbook_id}/execute",
        json={"is_simulation": False},
    )
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["status"] == "succeeded"
    assert len(exec_data["actions_attempted"]) == 2
    assert exec_data["execution_id"] is not None

    execution_id = exec_data["execution_id"]

    # 12. Retrieve execution audit record
    audit_res = client.get(f"/api/v1/playbooks/executions/{execution_id}")
    assert audit_res.status_code == 200
    assert audit_res.json()["execution_id"] == execution_id

    # 13. View playbook execution history
    history_res = client.get(f"/api/v1/playbooks/{playbook_id}/executions")
    assert history_res.status_code == 200
    assert history_res.json()["total"] >= 1


def test_api_invalid_action_rejection(client: TestClient):
    """API validation: Playbook creation with malicious or unallowlisted action fails."""
    payload = {
        "playbook_id": "pb_malicious_test",
        "name": "Malicious Action Test",
        "description": "Tries arbitrary shell command",
        "recovery_strategy": "circuit_break",
        "actions": [
            {
                "action_order": 1,
                "action_type": "execute_shell_script",
                "parameters": {"script": "echo hack"},
                "expected_outcome": "None",
            }
        ],
    }

    res = client.post("/api/v1/playbooks", json=payload)
    assert res.status_code == 400
    assert "not recognized in the allowlisted action registry" in res.json()["error"]["message"]
