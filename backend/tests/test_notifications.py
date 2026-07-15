"""
Backend tests for /api/notifications (broadcast notifications feature).
Endpoints:
  - GET    /api/notifications           (authenticated)
  - POST   /api/notifications           (authenticated)
  - DELETE /api/notifications/{id}      (authenticated)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lumix-prod-docs.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

LAB_EMAIL = 'laboratoriolumix@outlook.com'
LAB_PWD = 'Lumix2002'
OTHER_EMAIL = 'leonicelaboratorio@lumix.com'
OTHER_PWD = 'Lumix2002'

_created_notifs = []


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get('token') or j.get('access_token')


@pytest.fixture(scope='module')
def lab_token():
    return _login(LAB_EMAIL, LAB_PWD)


@pytest.fixture(scope='module')
def other_token():
    return _login(OTHER_EMAIL, OTHER_PWD)


@pytest.fixture(scope='module', autouse=True)
def cleanup(lab_token):
    yield
    for nid in _created_notifs:
        try:
            requests.delete(f"{API}/notifications/{nid}", headers={"Authorization": f"Bearer {lab_token}"}, timeout=15)
        except Exception:
            pass


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_unauthenticated_get_returns_401():
    r = requests.get(f"{API}/notifications", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_create_notification_success(lab_token):
    tag = uuid.uuid4().hex[:8]
    payload = {"product_name": f"TEST_Detergente_{tag}", "message": "produto com pouco estoque"}
    r = requests.post(f"{API}/notifications", json=payload, headers=_headers(lab_token), timeout=15)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    d = r.json()
    assert d['product_name'] == payload['product_name']
    assert d['message'] == payload['message']
    assert 'id' in d and isinstance(d['id'], str)
    assert d.get('created_by')
    assert d.get('created_at')
    assert '_id' not in d
    _created_notifs.append(d['id'])


def test_create_notification_empty_product_returns_400(lab_token):
    r = requests.post(f"{API}/notifications", json={"product_name": "   ", "message": "x"},
                      headers=_headers(lab_token), timeout=15)
    assert r.status_code == 400


def test_get_notifications_lists_created(lab_token):
    # ensure one exists
    tag = uuid.uuid4().hex[:8]
    name = f"TEST_Item_{tag}"
    r = requests.post(f"{API}/notifications", json={"product_name": name, "message": "obs"},
                      headers=_headers(lab_token), timeout=15)
    assert r.status_code == 200
    nid = r.json()['id']
    _created_notifs.append(nid)

    r2 = requests.get(f"{API}/notifications", headers=_headers(lab_token), timeout=15)
    assert r2.status_code == 200
    items = r2.json()
    assert isinstance(items, list)
    assert any(x['id'] == nid for x in items)
    # no mongo _id leaked
    for it in items:
        assert '_id' not in it


def test_broadcast_visible_to_other_user(lab_token, other_token):
    tag = uuid.uuid4().hex[:8]
    name = f"TEST_Broadcast_{tag}"
    r = requests.post(f"{API}/notifications", json={"product_name": name, "message": "broadcast"},
                      headers=_headers(lab_token), timeout=15)
    assert r.status_code == 200
    nid = r.json()['id']
    _created_notifs.append(nid)

    r2 = requests.get(f"{API}/notifications", headers=_headers(other_token), timeout=15)
    assert r2.status_code == 200
    ids = [x['id'] for x in r2.json()]
    assert nid in ids, "notification not visible to another authenticated user"


def test_delete_notification_removes_from_list(lab_token):
    tag = uuid.uuid4().hex[:8]
    r = requests.post(f"{API}/notifications", json={"product_name": f"TEST_Del_{tag}", "message": ""},
                      headers=_headers(lab_token), timeout=15)
    assert r.status_code == 200
    nid = r.json()['id']

    d = requests.delete(f"{API}/notifications/{nid}", headers=_headers(lab_token), timeout=15)
    assert d.status_code == 200

    r2 = requests.get(f"{API}/notifications", headers=_headers(lab_token), timeout=15)
    assert r2.status_code == 200
    assert all(x['id'] != nid for x in r2.json())


def test_other_user_can_delete(lab_token, other_token):
    tag = uuid.uuid4().hex[:8]
    r = requests.post(f"{API}/notifications", json={"product_name": f"TEST_Any_{tag}", "message": ""},
                      headers=_headers(lab_token), timeout=15)
    nid = r.json()['id']
    d = requests.delete(f"{API}/notifications/{nid}", headers=_headers(other_token), timeout=15)
    assert d.status_code == 200
