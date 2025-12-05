import requests
import sys
import json
from datetime import datetime

class LumixAPITester:
    def __init__(self, base_url="https://lumix-inventory.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.created_items = {
            'users': [],
            'products': [],
            'raw_materials': [],
            'product_batches': [],
            'raw_material_batches': [],
            'production_orders': [],
            'team_members': []
        }

    def log_result(self, test_name, success, details=""):
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")
        
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, auth_required=True):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.log_result(name, True)
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error details: {error_detail}")
                except:
                    print(f"   Response text: {response.text[:200]}")
                return False, {}

        except Exception as e:
            self.log_result(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET", 
            "",
            200,
            auth_required=False
        )
        return success

    def test_user_registration(self):
        """Test user registration"""
        test_user_data = {
            "email": f"test_{datetime.now().strftime('%H%M%S')}@lumix.com",
            "password": "TestPass123!",
            "name": "Test User"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=test_user_data,
            auth_required=False
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.created_items['users'].append(response['user'])
            return True
        return False

    def test_user_login(self):
        """Test user login with existing user"""
        if not self.created_items['users']:
            return False
            
        user = self.created_items['users'][0]
        login_data = {
            "email": user['email'],
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            auth_required=False
        )
        
        if success and 'token' in response:
            self.token = response['token']
            return True
        return False

    def test_get_user_profile(self):
        """Test getting current user profile"""
        success, response = self.run_test(
            "Get User Profile",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_create_raw_material(self):
        """Test creating raw material"""
        material_data = {
            "name": "Água Filtrada",
            "type": "Litros",
            "total_stock": 1000.0
        }
        
        success, response = self.run_test(
            "Create Raw Material",
            "POST",
            "raw-materials",
            200,
            data=material_data
        )
        
        if success:
            self.created_items['raw_materials'].append(response)
        return success

    def test_get_raw_materials(self):
        """Test getting raw materials"""
        success, response = self.run_test(
            "Get Raw Materials",
            "GET",
            "raw-materials",
            200
        )
        return success

    def test_create_product(self):
        """Test creating product with recipe"""
        if not self.created_items['raw_materials']:
            return False
            
        material_id = self.created_items['raw_materials'][0]['id']
        product_data = {
            "name": "Produto Teste",
            "unit": "Litros",
            "expected_liters": 500.0,
            "recipes": [
                {
                    "raw_material_id": material_id,
                    "quantity_per_liter": 0.8
                }
            ]
        }
        
        success, response = self.run_test(
            "Create Product",
            "POST",
            "products",
            200,
            data=product_data
        )
        
        if success:
            self.created_items['products'].append(response)
        return success

    def test_get_products(self):
        """Test getting products"""
        success, response = self.run_test(
            "Get Products",
            "GET",
            "products",
            200
        )
        return success

    def test_create_product_batch(self):
        """Test creating product batch"""
        if not self.created_items['products']:
            return False
            
        product_id = self.created_items['products'][0]['id']
        batch_data = {
            "product_id": product_id,
            "date": datetime.now().strftime('%Y-%m-%d'),
            "unit": "Litros",
            "planned_liters": 100.0
        }
        
        success, response = self.run_test(
            "Create Product Batch",
            "POST",
            "product-batches",
            200,
            data=batch_data
        )
        
        if success:
            self.created_items['product_batches'].append(response)
        return success

    def test_create_raw_material_batch(self):
        """Test creating raw material batch"""
        if not self.created_items['raw_materials']:
            return False
            
        material_id = self.created_items['raw_materials'][0]['id']
        batch_data = {
            "raw_material_id": material_id,
            "date": datetime.now().strftime('%Y-%m-%d'),
            "quantity": 50.0
        }
        
        success, response = self.run_test(
            "Create Raw Material Batch",
            "POST",
            "raw-material-batches",
            200,
            data=batch_data
        )
        
        if success:
            self.created_items['raw_material_batches'].append(response)
        return success

    def test_create_team_member(self):
        """Test creating team member"""
        member_data = {
            "name": "João Silva",
            "role": "Operador"
        }
        
        success, response = self.run_test(
            "Create Team Member",
            "POST",
            "team",
            200,
            data=member_data
        )
        
        if success:
            self.created_items['team_members'].append(response)
        return success

    def test_create_production_order(self):
        """Test creating production order"""
        if not (self.created_items['products'] and 
                self.created_items['product_batches'] and 
                self.created_items['team_members']):
            return False
            
        product = self.created_items['products'][0]
        batch = self.created_items['product_batches'][0]
        member = self.created_items['team_members'][0]
        
        order_data = {
            "product_id": product['id'],
            "product_batch_id": batch['id'],
            "date": datetime.now().strftime('%Y-%m-%d'),
            "weigher": member['name'],
            "production_size": 50.0,
            "materials_used": [
                {
                    "raw_material_id": product['recipes'][0]['raw_material_id'],
                    "quantity": 40.0
                }
            ]
        }
        
        success, response = self.run_test(
            "Create Production Order",
            "POST",
            "production-orders",
            200,
            data=order_data
        )
        
        if success:
            self.created_items['production_orders'].append(response)
        return success

    def test_counting_system(self):
        """Test counting/packaging system"""
        if not self.created_items['product_batches']:
            return False
            
        batch_id = self.created_items['product_batches'][0]['id']
        member_name = self.created_items['team_members'][0]['name'] if self.created_items['team_members'] else "Test Operator"
        
        counting_data = {
            "one_liter": 10,
            "two_liter": 15,
            "five_liter": 5,
            "operator": member_name
        }
        
        success, response = self.run_test(
            "Add Counting Entry",
            "POST",
            f"counting/{batch_id}",
            200,
            data=counting_data
        )
        return success

    def test_dashboard_summary(self):
        """Test dashboard summary"""
        success, response = self.run_test(
            "Dashboard Summary",
            "GET",
            "dashboard/summary",
            200
        )
        
        if success:
            print(f"   Dashboard data: {response}")
        return success

    def test_trash_system(self):
        """Test trash system"""
        # First get trash items
        success, response = self.run_test(
            "Get Trash Items",
            "GET",
            "trash",
            200
        )
        return success

    def test_product_with_kg_recipe(self):
        """Test creating product with Kg unit in recipe"""
        if not self.created_items['raw_materials']:
            return False
            
        material_id = self.created_items['raw_materials'][0]['id']
        product_data = {
            "name": "Produto com Receita Kg",
            "unit": "Litros",
            "expected_liters": 300.0,
            "recipes": [
                {
                    "raw_material_id": material_id,
                    "quantity_per_liter": 1.2,
                    "unit": "Kg"  # Testing Kg unit
                }
            ]
        }
        
        success, response = self.run_test(
            "Create Product with Kg Recipe",
            "POST",
            "products",
            200,
            data=product_data
        )
        
        if success:
            # Verify the unit was saved correctly
            recipe = response.get('recipes', [{}])[0]
            if recipe.get('unit') == 'Kg':
                print(f"   ✅ Recipe unit correctly saved as Kg")
                self.created_items['products'].append(response)
                return True
            else:
                print(f"   ❌ Recipe unit not saved correctly. Expected 'Kg', got '{recipe.get('unit')}'")
                return False
        return success

    def test_finalize_batches_for_archive(self):
        """Finalize some batches to prepare for archiving test"""
        success_count = 0
        
        # Finalize product batches
        for batch in self.created_items['product_batches']:
            # Update batch status to 'finalizado'
            success, response = self.run_test(
                f"Finalize Product Batch {batch['batch_number']}",
                "PUT",
                f"product-batches/{batch['id']}",
                200,
                data={"status": "finalizado"}  # This might not work as status is not in update model
            )
            if success:
                success_count += 1
        
        # Finalize raw material batches  
        for batch in self.created_items['raw_material_batches']:
            # Update batch status to 'finalizado'
            success, response = self.run_test(
                f"Finalize Raw Material Batch {batch['batch_number']}",
                "PUT", 
                f"raw-material-batches/{batch['id']}",
                200,
                data={"status": "finalizado"}  # This might not work as status is not in update model
            )
            if success:
                success_count += 1
                
        return success_count > 0

    def test_auto_archive_month(self):
        """Test auto-archive endpoint"""
        success, response = self.run_test(
            "Auto Archive Month",
            "POST",
            "archive/auto-archive-month",
            200
        )
        
        if success:
            print(f"   Archive results: {response}")
        return success

    def test_get_archive_months(self):
        """Test getting list of archived months"""
        success, response = self.run_test(
            "Get Archive Months",
            "GET",
            "archive/months",
            200
        )
        
        if success:
            print(f"   Available archive months: {len(response)} months")
            if response:
                # Store first month for next test
                self.archive_month = response[0]
        return success

    def test_get_archived_products(self):
        """Test getting archived products for a specific month"""
        if not hasattr(self, 'archive_month'):
            print("   Skipping - no archive months available")
            return True
            
        month_data = self.archive_month
        success, response = self.run_test(
            f"Get Archived Products {month_data['month_name']}",
            "GET",
            f"archive/products/{month_data['year']}/{month_data['month']}",
            200
        )
        
        if success:
            print(f"   Found {len(response)} archived products")
        return success

    def test_get_archived_raw_materials(self):
        """Test getting archived raw materials for a specific month"""
        if not hasattr(self, 'archive_month'):
            print("   Skipping - no archive months available")
            return True
            
        month_data = self.archive_month
        success, response = self.run_test(
            f"Get Archived Raw Materials {month_data['month_name']}",
            "GET",
            f"archive/raw-materials/{month_data['year']}/{month_data['month']}",
            200
        )
        
        if success:
            print(f"   Found {len(response)} archived raw materials")
        return success

    def test_dashboard_reset_liters(self):
        """Test dashboard reset liters functionality"""
        # First get current dashboard to see liters count
        success, response = self.run_test(
            "Get Dashboard Before Reset",
            "GET",
            "dashboard/summary",
            200
        )
        
        if success:
            liters_before = response.get('liters_bottled_month', 0)
            print(f"   Liters before reset: {liters_before}")
        
        # Now reset the counter
        success, response = self.run_test(
            "Reset Liters Counter",
            "POST",
            "dashboard/reset-liters",
            200
        )
        
        if success:
            print(f"   Reset result: {response}")
            
            # Verify the reset worked by checking dashboard again
            success2, response2 = self.run_test(
                "Get Dashboard After Reset",
                "GET",
                "dashboard/summary",
                200
            )
            
            if success2:
                liters_after = response2.get('liters_bottled_month', 0)
                print(f"   Liters after reset: {liters_after}")
                if liters_after == 0:
                    print(f"   ✅ Reset successful - counter is now 0")
                    return True
                else:
                    print(f"   ❌ Reset failed - counter is still {liters_after}")
                    return False
        
        return success

def main():
    print("🚀 Starting Lumix API Testing...")
    print("=" * 50)
    
    tester = LumixAPITester()
    
    # Test sequence
    tests = [
        tester.test_root_endpoint,
        tester.test_user_registration,
        tester.test_user_login,
        tester.test_get_user_profile,
        tester.test_create_raw_material,
        tester.test_get_raw_materials,
        tester.test_create_product,
        tester.test_get_products,
        tester.test_create_product_batch,
        tester.test_create_raw_material_batch,
        tester.test_create_team_member,
        tester.test_create_production_order,
        tester.test_counting_system,
        tester.test_dashboard_summary,
        tester.test_trash_system
    ]
    
    # Run all tests
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    # Print failed tests
    failed_tests = [r for r in tester.test_results if not r['success']]
    if failed_tests:
        print("\n❌ Failed Tests:")
        for test in failed_tests:
            print(f"   - {test['test']}: {test['details']}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())