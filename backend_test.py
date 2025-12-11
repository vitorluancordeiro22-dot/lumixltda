import requests
import sys
import json
from datetime import datetime

class LumixAPITester:
    def __init__(self, base_url="https://smart-factory-24.preview.emergentagent.com"):
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
        """Test user login with provided credentials"""
        # Use the credentials provided in the review request
        login_data = {
            "email": "teste@teste.com",
            "password": "password"
        }
        
        success, response = self.run_test(
            "User Login (Provided Credentials)",
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
        """Finalize some batches to prepare for archiving test by adding enough counting"""
        success_count = 0
        
        # Finalize product batches by adding counting that meets planned liters
        for batch in self.created_items['product_batches']:
            planned_liters = batch.get('planned_liters', 100)
            member_name = self.created_items['team_members'][0]['name'] if self.created_items['team_members'] else "Test Operator"
            
            # Add counting to reach planned liters (using 5L bottles for efficiency)
            bottles_needed = int(planned_liters / 5) + 1
            counting_data = {
                "one_liter": 0,
                "two_liter": 0,
                "five_liter": bottles_needed,
                "operator": member_name
            }
            
            success, response = self.run_test(
                f"Finalize Product Batch {batch['batch_number']} via Counting",
                "POST",
                f"counting/{batch['id']}",
                200,
                data=counting_data
            )
            if success:
                success_count += 1
        
        # For raw material batches, we need to manually update status via direct DB access
        # Since there's no API endpoint to finalize them, we'll skip this for now
        # The archiving test will work with whatever batches are available
                
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

    def test_pdf_generation_system(self):
        """Test complete PDF document generation system for Industrial OPs"""
        print("\n🔍 Testing PDF Document Generation System...")
        
        # Step 1: Login with provided credentials
        login_success = self.test_user_login()
        if not login_success:
            print("❌ Login failed - cannot proceed with PDF tests")
            return False
        
        # Step 2: Check if specific product exists with templates
        success, products = self.run_test(
            "Get Products for Template Check",
            "GET",
            "products",
            200
        )
        
        target_product = None
        target_product_id = "0b9ded25-0fd2-478a-9305-42a50e645689"
        
        if success:
            for product in products:
                if product.get('id') == target_product_id:
                    target_product = product
                    break
            
            if target_product:
                file_models = target_product.get('file_models', {})
                print(f"   ✅ Found target product: {target_product.get('name')}")
                print(f"   Templates available: {list(file_models.keys())}")
                
                if not file_models:
                    print("   ❌ Product has no templates - PDF generation will fail")
                    return False
            else:
                print(f"   ❌ Target product {target_product_id} not found")
                return False
        else:
            print("   ❌ Failed to get products")
            return False
        
        # Step 3: List existing Industrial OPs
        success, ops = self.run_test(
            "List Industrial OPs",
            "GET",
            "industrial-ops",
            200
        )
        
        target_op = None
        if success:
            print(f"   ✅ Found {len(ops)} Industrial OPs")
            
            # Look for OP-2025-0002 specifically
            for op in ops:
                if op.get('op_number') == 'OP-2025-0002':
                    target_op = op
                    break
            
            if target_op:
                print(f"   ✅ Found target OP: {target_op.get('op_number')}")
            else:
                print("   ⚠️  OP-2025-0002 not found, will use first available OP")
                if ops:
                    target_op = ops[0]
                    print(f"   Using OP: {target_op.get('op_number')}")
        else:
            print("   ❌ Failed to get Industrial OPs")
            return False
        
        if not target_op:
            print("   ❌ No Industrial OPs available for testing")
            return False
        
        # Step 4: Generate documents for the OP
        op_id = target_op.get('id')
        success, response = self.run_test(
            f"Generate Documents for OP {target_op.get('op_number')}",
            "POST",
            f"industrial-ops/{op_id}/generate-documents",
            200
        )
        
        generated_files = []
        if success:
            documents = response.get('documents', [])
            print(f"   ✅ Generated {len(documents)} documents")
            
            for doc in documents:
                print(f"   - {doc.get('type')}: {doc.get('filename')}")
                generated_files.append(doc.get('file_id'))
            
            if len(documents) != 2:
                print(f"   ⚠️  Expected 2 documents (FICHA + OP), got {len(documents)}")
        else:
            print("   ❌ Failed to generate documents")
            return False
        
        # Step 5: Download and validate PDFs
        pdf_validation_success = True
        for file_id in generated_files:
            success, pdf_content = self.download_and_validate_pdf(file_id)
            if not success:
                pdf_validation_success = False
        
        # Step 6: Test error scenarios
        error_tests_success = self.test_pdf_generation_errors()
        
        return pdf_validation_success and error_tests_success

    def download_and_validate_pdf(self, file_id):
        """Download and validate a PDF file"""
        import requests
        
        url = f"{self.base_url}/api/documents/download/{file_id}"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                content = response.content
                
                # Validate PDF header
                if content.startswith(b'%PDF'):
                    size_kb = len(content) / 1024
                    print(f"   ✅ PDF {file_id}: Valid PDF, {size_kb:.1f} KB")
                    
                    if size_kb > 10:
                        print(f"   ✅ PDF size > 10KB requirement met")
                        return True, content
                    else:
                        print(f"   ❌ PDF size {size_kb:.1f} KB < 10KB minimum")
                        return False, None
                else:
                    print(f"   ❌ PDF {file_id}: Invalid PDF format")
                    return False, None
            else:
                print(f"   ❌ PDF {file_id}: Download failed with status {response.status_code}")
                return False, None
                
        except Exception as e:
            print(f"   ❌ PDF {file_id}: Download error - {str(e)}")
            return False, None

    def test_pdf_generation_errors(self):
        """Test error scenarios for PDF generation"""
        print("\n🔍 Testing PDF Generation Error Scenarios...")
        
        # Test 1: OP without templates (if we can find one)
        success, products = self.run_test(
            "Get Products for Error Test",
            "GET",
            "products",
            200
        )
        
        product_without_templates = None
        if success:
            for product in products:
                file_models = product.get('file_models', {})
                if not file_models or (not file_models.get('op_model') and not file_models.get('ficha_analise')):
                    product_without_templates = product
                    break
        
        if product_without_templates:
            # We would need to create an OP for this product first
            # For now, we'll skip this test as it requires more setup
            print("   ⚠️  Skipping 'OP without templates' test - requires additional setup")
        
        # Test 2: Invalid OP ID
        success, response = self.run_test(
            "Generate Documents for Invalid OP",
            "POST",
            "industrial-ops/invalid-op-id/generate-documents",
            404
        )
        
        if success:
            print("   ✅ Invalid OP ID correctly returns 404")
        else:
            print("   ❌ Invalid OP ID test failed")
            return False
        
        # Test 3: Invalid file download
        success, response = self.run_test(
            "Download Invalid Document",
            "GET",
            "documents/download/invalid-file-id",
            404
        )
        
        if success:
            print("   ✅ Invalid file ID correctly returns 404")
        else:
            print("   ❌ Invalid file ID test failed")
            return False
        
        return True

def main():
    print("🚀 Starting Lumix API Testing...")
    print("=" * 50)
    
    tester = LumixAPITester()
    
    # Test sequence - PDF Generation System (as requested in review)
    tests = [
        tester.test_pdf_generation_system,  # PRIMARY TEST: PDF Document Generation System
        tester.test_root_endpoint,
        tester.test_user_registration,
        tester.test_user_login,
        tester.test_get_user_profile,
        tester.test_create_raw_material,
        tester.test_get_raw_materials,
        tester.test_create_product,
        tester.test_get_products,
        tester.test_product_with_kg_recipe,  # NEW: Test Kg unit in recipes
        tester.test_create_product_batch,
        tester.test_create_raw_material_batch,
        tester.test_create_team_member,
        tester.test_create_production_order,
        tester.test_counting_system,
        tester.test_dashboard_summary,
        tester.test_dashboard_reset_liters,  # NEW: Test reset functionality
        tester.test_finalize_batches_for_archive,  # NEW: Prepare for archiving
        tester.test_auto_archive_month,  # NEW: Test archiving
        tester.test_get_archive_months,  # NEW: Test archive months list
        tester.test_get_archived_products,  # NEW: Test archived products
        tester.test_get_archived_raw_materials,  # NEW: Test archived raw materials
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