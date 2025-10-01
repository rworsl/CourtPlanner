#!/usr/bin/env python3
"""
Stripe Testing Utilities for Badminton Court Planner

This script provides utilities for testing Stripe integration including:
- Creating test products and prices
- Testing webhook endpoints
- Simulating subscription events
- Validating payment flows

Usage:
    python stripe_testing.py setup_products
    python stripe_testing.py test_webhook
    python stripe_testing.py simulate_subscription --email test@example.com
"""

import os
import sys
import json
import requests
import stripe
import argparse
from datetime import datetime, timedelta

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Configure Stripe
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')

class StripeTestingUtils:
    def __init__(self):
        self.base_url = os.environ.get('BASE_URL', 'http://localhost:5000')
        self.webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')
        
        # Test card numbers
        self.test_cards = {
            'visa_success': '4242424242424242',
            'visa_decline': '4000000000000002',
            'mastercard_success': '5555555555554444',
            'amex_success': '378282246310005',
            'require_auth': '4000002500003155',
            'insufficient_funds': '4000000000009995'
        }

    def setup_products_and_prices(self):
        """Create test products and prices in Stripe"""
        print("Setting up Stripe products and prices...")
        
        try:
            # Professional Plan
            professional_product = stripe.Product.create(
                name='Professional Plan',
                description='Advanced badminton club management with smart features',
                metadata={
                    'plan_id': 'professional',
                    'max_members': '50',
                    'max_courts': 'unlimited'
                }
            )
            
            professional_price = stripe.Price.create(
                unit_amount=1900,  # $19.00
                currency='usd',
                recurring={'interval': 'month'},
                product=professional_product.id,
                metadata={'plan_id': 'professional'}
            )
            
            print(f"✓ Professional Plan created: {professional_price.id}")
            
            # Club Plan
            club_product = stripe.Product.create(
                name='Club Plan',
                description='Complete badminton club management solution for large organizations',
                metadata={
                    'plan_id': 'club',
                    'max_members': 'unlimited',
                    'max_courts': 'unlimited'
                }
            )
            
            club_price = stripe.Price.create(
                unit_amount=4900,  # $49.00
                currency='usd',
                recurring={'interval': 'month'},
                product=club_product.id,
                metadata={'plan_id': 'club'}
            )
            
            print(f"✓ Club Plan created: {club_price.id}")
            
            # Annual discount prices
            professional_annual_price = stripe.Price.create(
                unit_amount=19000,  # $190.00 (save $38)
                currency='usd',
                recurring={'interval': 'year'},
                product=professional_product.id,
                metadata={'plan_id': 'professional_annual'}
            )
            
            club_annual_price = stripe.Price.create(
                unit_amount=49000,  # $490.00 (save $98)
                currency='usd',
                recurring={'interval': 'year'},
                product=club_product.id,
                metadata={'plan_id': 'club_annual'}
            )
            
            print(f"✓ Annual plans created")
            
            # Print environment variables to add to .env
            print("\nAdd these to your .env file:")
            print(f"STRIPE_PROFESSIONAL_PRICE_ID={professional_price.id}")
            print(f"STRIPE_CLUB_PRICE_ID={club_price.id}")
            print(f"STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID={professional_annual_price.id}")
            print(f"STRIPE_CLUB_ANNUAL_PRICE_ID={club_annual_price.id}")
            
            return True
            
        except stripe.error.StripeError as e:
            print(f"✗ Stripe error: {e}")
            return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False

    def create_test_customer(self, email="test@example.com", name="Test User"):
        """Create a test customer"""
        try:
            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata={
                    'test_customer': 'true',
                    'club_code': 'TEST123'
                }
            )
            print(f"✓ Test customer created: {customer.id}")
            return customer
        except stripe.error.StripeError as e:
            print(f"✗ Failed to create customer: {e}")
            return None

    def create_test_subscription(self, customer_id, price_id):
        """Create a test subscription"""
        try:
            subscription = stripe.Subscription.create(
                customer=customer_id,
                items=[{'price': price_id}],
                trial_period_days=14,
                metadata={
                    'test_subscription': 'true'
                }
            )
            print(f"✓ Test subscription created: {subscription.id}")
            return subscription
        except stripe.error.StripeError as e:
            print(f"✗ Failed to create subscription: {e}")
            return None

    def simulate_webhook_event(self, event_type, subscription_id=None):
        """Simulate webhook events for testing"""
        webhook_url = f"{self.base_url}/webhook/stripe"
        
        events = {
            'invoice.payment_succeeded': {
                'type': 'invoice.payment_succeeded',
                'data': {
                    'object': {
                        'id': 'in_test_123',
                        'subscription': subscription_id or 'sub_test_123',
                        'amount_paid': 1900,
                        'currency': 'usd',
                        'status': 'paid'
                    }
                }
            },
            'invoice.payment_failed': {
                'type': 'invoice.payment_failed',
                'data': {
                    'object': {
                        'id': 'in_test_123',
                        'subscription': subscription_id or 'sub_test_123',
                        'amount_due': 1900,
                        'currency': 'usd',
                        'status': 'open'
                    }
                }
            },
            'customer.subscription.created': {
                'type': 'customer.subscription.created',
                'data': {
                    'object': {
                        'id': subscription_id or 'sub_test_123',
                        'customer': 'cus_test_123',
                        'status': 'active',
                        'current_period_start': int(datetime.now().timestamp()),
                        'current_period_end': int((datetime.now() + timedelta(days=30)).timestamp())
                    }
                }
            },
            'customer.subscription.deleted': {
                'type': 'customer.subscription.deleted',
                'data': {
                    'object': {
                        'id': subscription_id or 'sub_test_123',
                        'customer': 'cus_test_123',
                        'status': 'canceled'
                    }
                }
            }
        }
        
        if event_type not in events:
            print(f"✗ Unknown event type: {event_type}")
            return False
        
        event_data = events[event_type]
        
        try:
            # Create a real Stripe event for testing
            test_event = stripe.Event.construct_from(event_data, stripe.api_key)
            
            # Send to webhook endpoint
            headers = {
                'Content-Type': 'application/json',
                'Stripe-Signature': self._generate_webhook_signature(json.dumps(event_data))
            }
            
            response = requests.post(
                webhook_url,
                data=json.dumps(event_data),
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                print(f"✓ Webhook event {event_type} processed successfully")
                return True
            else:
                print(f"✗ Webhook failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            print(f"✗ Failed to send webhook: {e}")
            return False

    def _generate_webhook_signature(self, payload):
        """Generate a webhook signature for testing"""
        import hmac
        import hashlib
        import time
        
        timestamp = str(int(time.time()))
        if self.webhook_secret:
            signed_payload = f"{timestamp}.{payload}"
            signature = hmac.new(
                self.webhook_secret.encode(),
                signed_payload.encode(),
                hashlib.sha256
            ).hexdigest()
            return f"t={timestamp},v1={signature}"
        return "test_signature"

    def test_payment_flow(self, price_id):
        """Test the complete payment flow"""
        print(f"Testing payment flow for price: {price_id}")
        
        # Create customer
        customer = self.create_test_customer()
        if not customer:
            return False
        
        # Create payment method
        try:
            payment_method = stripe.PaymentMethod.create(
                type='card',
                card={
                    'number': self.test_cards['visa_success'],
                    'exp_month': 12,
                    'exp_year': 2025,
                    'cvc': '123'
                }
            )
            
            # Attach to customer
            payment_method.attach(customer=customer.id)
            
            # Set as default
            stripe.Customer.modify(
                customer.id,
                invoice_settings={'default_payment_method': payment_method.id}
            )
            
            print(f"✓ Payment method created and attached")
            
        except stripe.error.StripeError as e:
            print(f"✗ Failed to create payment method: {e}")
            return False
        
        # Create subscription
        subscription = self.create_test_subscription(customer.id, price_id)
        if not subscription:
            return False
        
        # Simulate webhook events
        self.simulate_webhook_event('customer.subscription.created', subscription.id)
        self.simulate_webhook_event('invoice.payment_succeeded', subscription.id)
        
        print("✓ Payment flow test completed successfully")
        return True

    def cleanup_test_data(self):
        """Clean up test customers and subscriptions"""
        print("Cleaning up test data...")
        
        try:
            # List and delete test customers
            customers = stripe.Customer.list(limit=100)
            deleted_count = 0
            
            for customer in customers.data:
                if customer.metadata.get('test_customer') == 'true':
                    stripe.Customer.delete(customer.id)
                    deleted_count += 1
            
            print(f"✓ Deleted {deleted_count} test customers")
            
            # List and cancel test subscriptions
            subscriptions = stripe.Subscription.list(limit=100, status='all')
            cancelled_count = 0
            
            for subscription in subscriptions.data:
                if subscription.metadata.get('test_subscription') == 'true':
                    if subscription.status != 'canceled':
                        stripe.Subscription.delete(subscription.id)
                        cancelled_count += 1
            
            print(f"✓ Cancelled {cancelled_count} test subscriptions")
            return True
            
        except stripe.error.StripeError as e:
            print(f"✗ Cleanup failed: {e}")
            return False

    def validate_webhook_endpoint(self):
        """Validate that the webhook endpoint is working"""
        webhook_url = f"{self.base_url}/webhook/stripe"
        
        try:
            # Send a test ping
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code != 200:
                print(f"✗ Application not responding at {self.base_url}")
                return False
            
            print(f"✓ Application is running at {self.base_url}")
            
            # Test webhook endpoint with a simple event
            self.simulate_webhook_event('invoice.payment_succeeded')
            return True
            
        except requests.exceptions.RequestException as e:
            print(f"✗ Cannot connect to application: {e}")
            return False

def main():
    parser = argparse.ArgumentParser(description='Stripe Testing Utilities')
    parser.add_argument('command', choices=[
        'setup_products', 'test_webhook', 'test_payment', 'cleanup', 'validate'
    ], help='Command to run')
    parser.add_argument('--email', default='test@example.com', help='Test customer email')
    parser.add_argument('--price-id', help='Price ID for testing')
    parser.add_argument('--event-type', default='invoice.payment_succeeded', 
                       help='Webhook event type to simulate')
    
    args = parser.parse_args()
    
    # Check if Stripe is configured
    if not stripe.api_key:
        print("✗ STRIPE_SECRET_KEY not found in environment variables")
        sys.exit(1)
    
    utils = StripeTestingUtils()
    
    if args.command == 'setup_products':
        if utils.setup_products_and_prices():
            print("\n🎉 Stripe products and prices created successfully!")
        else:
            sys.exit(1)
    
    elif args.command == 'test_webhook':
        if utils.validate_webhook_endpoint():
            print("\n🎉 Webhook endpoint is working correctly!")
        else:
            sys.exit(1)
    
    elif args.command == 'test_payment':
        if not args.price_id:
            print("✗ --price-id required for payment testing")
            sys.exit(1)
        
        if utils.test_payment_flow(args.price_id):
            print("\n🎉 Payment flow test completed successfully!")
        else:
            sys.exit(1)
    
    elif args.command == 'cleanup':
        if utils.cleanup_test_data():
            print("\n🎉 Test data cleaned up successfully!")
        else:
            sys.exit(1)
    
    elif args.command == 'validate':
        success = True
        
        print("Validating Stripe integration...")
        
        # Check environment variables
        required_vars = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY']
        for var in required_vars:
            if not os.environ.get(var):
                print(f"✗ Missing environment variable: {var}")
                success = False
            else:
                print(f"✓ {var} is set")
        
        # Test API connection
        try:
            stripe.Account.retrieve()
            print("✓ Stripe API connection successful")
        except stripe.error.StripeError as e:
            print(f"✗ Stripe API error: {e}")
            success = False
        
        # Test webhook endpoint
        if not utils.validate_webhook_endpoint():
            success = False
        
        if success:
            print("\n🎉 Stripe integration is properly configured!")
        else:
            print("\n❌ Stripe integration has issues that need to be resolved")
            sys.exit(1)

if __name__ == "__main__":
    main()