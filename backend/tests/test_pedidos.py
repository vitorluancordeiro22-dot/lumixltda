"""
Backend tests for the Pedidos (Purchase Orders) module.
Endpoints under test:
  - GET/POST /api/suppliers/{id}/catalog, DELETE /api/suppliers/{id}/catalog/{item_id}
  - GET/POST /api/purchase-orders, PUT /api/purchase-orders/{id}/status
  - DELETE /api/purchase-orders/{id}, GET /api/purchase-orders/{id}/pdf
Access control: only leonicelaboratorio@lumix.com and laboratoriolumix@outlook.com.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lumix-prod-docs.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ALLOWED_EMAIL = 'laboratoriolumix@outlook.com'
ALLOWED_PASSWORD = 'Lumix2002'
ALLOWED_EMAIL_2 = 'leonicelaboratorio@lumix.com'

# Stash test artifacts for cleanup
_created_orders = []
_created_suppliers = []
_created_catalog_items = []  # (supplier_id, item_id)


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _register_random_user():
    # try several times to find non-existing email
    suffix = uuid.uuid4().hex[:10]
    email = f"TESTuser_{suffix}@example.com"
    password = "TestPass123"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST User"}, timeout=30)
    return r, email, password


@pytest.fixture(scope='module')
def allowed_token():
    r = _login(ALLOWED_EMAIL, ALLOWED_PASSWORD)
    assert r.status_code == 200, f"Login failed for allowed user: {r.status_code} {r.text}"
    return r.json()['token']


@pytest.fixture(scope='module')
def allowed_token_2():
    r = _login(ALLOWED_EMAIL_2, ALLOWED_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Second allowlisted user login failed: {r.status_code} {r.text}")
    return r.json()['token']


@pytest.fixture(scope='module')
def non_allowed_token():
    r, email, pw = _register_random_user()
    if r.status_code != 200:
        # If somehow already registered, try login
        r2 = _login(email, pw)
        if r2.status_code != 200:
            pytest.skip(f"Could not create non-allowlisted test user: {r.status_code} {r.text}")
        return r2.json()['token']
    return r.json()['token']


@pytest.fixture(scope='module')
def headers(allowed_token):
    return {"Authorization": f"Bearer {allowed_token}", "Content-Type": "application/json"}


@pytest.fixture(scope='module')
def supplier_id(headers):
    """Create a test supplier (or reuse existing) and ensure it exists."""
    payload = {"name": f"TEST_Fornecedor_{uuid.uuid4().hex[:6]}", "contact": "Test", "phone": "11999999999", "email": "test@sup.com", "address": "Rua Test"}
    r = requests.post(f"{API}/suppliers", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, f"Failed to create supplier: {r.status_code} {r.text}"
    s = r.json()
    _created_suppliers.append(s['id'])
    return s['id']


# ============== ACCESS CONTROL ==============

class TestAccessControl:
    def test_allowed_login_succeeds(self):
        r = _login(ALLOWED_EMAIL, ALLOWED_PASSWORD)
        assert r.status_code == 200
        assert 'token' in r.json()

    def test_allowed_user_can_list_orders(self, headers):
        r = requests.get(f"{API}/purchase-orders", headers=headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_second_allowed_user_can_list_orders(self, allowed_token_2):
        h = {"Authorization": f"Bearer {allowed_token_2}"}
        r = requests.get(f"{API}/purchase-orders", headers=h, timeout=30)
        assert r.status_code == 200

    def test_non_allowed_user_blocked_on_list_orders(self, non_allowed_token):
        h = {"Authorization": f"Bearer {non_allowed_token}"}
        r = requests.get(f"{API}/purchase-orders", headers=h, timeout=30)
        assert r.status_code == 403

    def test_non_allowed_user_blocked_on_create_order(self, non_allowed_token, supplier_id):
        h = {"Authorization": f"Bearer {non_allowed_token}", "Content-Type": "application/json"}
        body = {"supplier_id": supplier_id, "supplier_name": "X", "items": [{"name": "a", "unit": "Kg", "quantity": 1}], "observations": ""}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=h, timeout=30)
        assert r.status_code == 403

    def test_non_allowed_user_blocked_on_catalog(self, non_allowed_token, supplier_id):
        h = {"Authorization": f"Bearer {non_allowed_token}"}
        r = requests.get(f"{API}/suppliers/{supplier_id}/catalog", headers=h, timeout=30)
        assert r.status_code == 403


# ============== CATALOG ==============

class TestCatalog:
    def test_get_empty_catalog(self, headers, supplier_id):
        r = requests.get(f"{API}/suppliers/{supplier_id}/catalog", headers=headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_add_custom_catalog_item(self, headers, supplier_id):
        payload = {"name": f"TEST_Item_{uuid.uuid4().hex[:6]}", "unit": "Kg"}
        r = requests.post(f"{API}/suppliers/{supplier_id}/catalog", json=payload, headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data['name'] == payload['name']
        assert data['unit'] == 'Kg'
        assert data['source'] == 'custom'
        assert 'id' in data
        _created_catalog_items.append((supplier_id, data['id']))

        # Verify via GET that item is persisted
        r2 = requests.get(f"{API}/suppliers/{supplier_id}/catalog", headers=headers, timeout=30)
        assert r2.status_code == 200
        names = [i['name'] for i in r2.json()]
        assert payload['name'] in names

    def test_duplicate_catalog_item_returns_existing(self, headers, supplier_id):
        name = f"TEST_Dup_{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/suppliers/{supplier_id}/catalog", json={"name": name, "unit": "L"}, headers=headers, timeout=30)
        assert r1.status_code == 200
        id1 = r1.json()['id']
        _created_catalog_items.append((supplier_id, id1))

        r2 = requests.post(f"{API}/suppliers/{supplier_id}/catalog", json={"name": name, "unit": "L"}, headers=headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()['id'] == id1  # Should return existing not duplicate


# ============== PURCHASE ORDERS CRUD ==============

class TestPurchaseOrders:
    def test_create_order_increments_sequential_number(self, headers, supplier_id):
        body = {
            "supplier_id": supplier_id,
            "supplier_name": "TEST Supplier",
            "items": [{"name": f"TEST_OrderItem_{uuid.uuid4().hex[:5]}", "unit": "Kg", "quantity": 5}],
            "observations": "Pedido de teste automatizado"
        }
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order['status'] == 'pendente'
        assert order['supplier_name'] == 'TEST Supplier'
        assert order['order_number'].startswith('PED-')
        assert len(order['order_number']) == 8  # PED-NNNN
        assert isinstance(order['seq'], int) and order['seq'] >= 1
        assert len(order['items']) == 1
        _created_orders.append(order['id'])
        # GET back persisted
        list_resp = requests.get(f"{API}/purchase-orders", headers=headers, timeout=30)
        assert list_resp.status_code == 200
        ids = [o['id'] for o in list_resp.json()]
        assert order['id'] in ids

    def test_create_order_saves_custom_item_in_supplier_catalog(self, headers, supplier_id):
        item_name = f"TEST_AutoSave_{uuid.uuid4().hex[:6]}"
        body = {
            "supplier_id": supplier_id,
            "supplier_name": "TEST Supplier",
            "items": [{"name": item_name, "unit": "L", "quantity": 2}],
            "observations": ""
        }
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        _created_orders.append(r.json()['id'])

        # Catalog should now include the item
        c = requests.get(f"{API}/suppliers/{supplier_id}/catalog", headers=headers, timeout=30)
        assert c.status_code == 200
        assert item_name in [i['name'] for i in c.json()]

    def test_create_order_empty_items_rejected(self, headers, supplier_id):
        body = {"supplier_id": supplier_id, "supplier_name": "X", "items": [], "observations": ""}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        assert r.status_code == 400

    def test_status_workflow_pendente_enviado_recebido(self, headers, supplier_id):
        # Create
        body = {"supplier_id": supplier_id, "supplier_name": "TEST", "items": [{"name": "X", "unit": "Kg", "quantity": 1}]}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        assert r.status_code == 200
        order_id = r.json()['id']
        _created_orders.append(order_id)
        assert r.json()['status'] == 'pendente'

        # -> enviado
        r2 = requests.put(f"{API}/purchase-orders/{order_id}/status", json={"status": "enviado"}, headers=headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()['status'] == 'enviado'

        # -> recebido
        r3 = requests.put(f"{API}/purchase-orders/{order_id}/status", json={"status": "recebido"}, headers=headers, timeout=30)
        assert r3.status_code == 200
        assert r3.json()['status'] == 'recebido'
        assert r3.json()['delivered_at'] is not None

        # reopen -> pendente (delivered_at should be cleared)
        r4 = requests.put(f"{API}/purchase-orders/{order_id}/status", json={"status": "pendente"}, headers=headers, timeout=30)
        assert r4.status_code == 200
        assert r4.json()['status'] == 'pendente'
        assert r4.json()['delivered_at'] is None

    def test_invalid_status_rejected(self, headers, supplier_id):
        body = {"supplier_id": supplier_id, "supplier_name": "TEST", "items": [{"name": "X", "unit": "Kg", "quantity": 1}]}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        order_id = r.json()['id']
        _created_orders.append(order_id)
        r2 = requests.put(f"{API}/purchase-orders/{order_id}/status", json={"status": "foo"}, headers=headers, timeout=30)
        assert r2.status_code == 400

    def test_pdf_endpoint_returns_pdf(self, headers, supplier_id):
        body = {"supplier_id": supplier_id, "supplier_name": "TEST", "items": [{"name": "X", "unit": "Kg", "quantity": 1}]}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        order_id = r.json()['id']
        _created_orders.append(order_id)
        r2 = requests.get(f"{API}/purchase-orders/{order_id}/pdf", headers=headers, timeout=60)
        assert r2.status_code == 200, r2.text[:300]
        assert 'application/pdf' in r2.headers.get('content-type', '').lower()
        assert r2.content[:4] == b'%PDF'

    def test_delete_order_removes_from_list(self, headers, supplier_id):
        body = {"supplier_id": supplier_id, "supplier_name": "TEST", "items": [{"name": "X", "unit": "Kg", "quantity": 1}]}
        r = requests.post(f"{API}/purchase-orders", json=body, headers=headers, timeout=30)
        order_id = r.json()['id']
        d = requests.delete(f"{API}/purchase-orders/{order_id}", headers=headers, timeout=30)
        assert d.status_code == 200
        list_resp = requests.get(f"{API}/purchase-orders", headers=headers, timeout=30)
        ids = [o['id'] for o in list_resp.json()]
        assert order_id not in ids


# ============== Cleanup ==============

def teardown_module(module):
    try:
        token = _login(ALLOWED_EMAIL, ALLOWED_PASSWORD).json()['token']
        h = {"Authorization": f"Bearer {token}"}
        for oid in _created_orders:
            requests.delete(f"{API}/purchase-orders/{oid}", headers=h, timeout=15)
        for sid, iid in _created_catalog_items:
            requests.delete(f"{API}/suppliers/{sid}/catalog/{iid}", headers=h, timeout=15)
        for sid in _created_suppliers:
            requests.delete(f"{API}/suppliers/{sid}", headers=h, timeout=15)
    except Exception:
        pass
