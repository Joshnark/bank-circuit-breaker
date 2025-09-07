#!/bin/bash

# Circuit Breaker Infrastructure Deployment Script

set -e

# Default values
PROJECT_NAME="bank-circuit-breaker"
ENVIRONMENT="dev"
AWS_REGION="us-east-1"
STACK_NAME=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project-name)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --project-name    Project name (default: bank-circuit-breaker)"
            echo "  --environment     Environment (default: dev)"
            echo "  --region          AWS region (default: us-east-1)"
            echo "  --stack-name      CloudFormation stack name (default: PROJECT_NAME-infrastructure-ENVIRONMENT)"
            echo "  --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Deploy with defaults"
            echo "  $0 --environment prod --region us-west-2"
            echo "  $0 --project-name my-app --environment staging"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Set default stack name if not provided
if [[ -z "$STACK_NAME" ]]; then
    STACK_NAME="${PROJECT_NAME}-infrastructure-${ENVIRONMENT}"
fi

echo "=========================================="
echo "Circuit Breaker Infrastructure Deployment"
echo "=========================================="
echo "Project Name: $PROJECT_NAME"
echo "Environment:  $ENVIRONMENT" 
echo "AWS Region:   $AWS_REGION"
echo "Stack Name:   $STACK_NAME"
echo "=========================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Validate CloudFormation template
echo "Validating CloudFormation template..."
aws cloudformation validate-template \
    --template-body file://circuit-breaker-infrastructure.yaml \
    --region "$AWS_REGION"

if [[ $? -ne 0 ]]; then
    echo "Error: CloudFormation template validation failed."
    exit 1
fi

echo "Template validation successful!"

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [[ "$STACK_EXISTS" == "DOES_NOT_EXIST" ]]; then
    echo "Creating new CloudFormation stack..."
    OPERATION="create-stack"
else
    echo "Updating existing CloudFormation stack..."
    OPERATION="update-stack"
fi

# Deploy/Update the stack
echo "Deploying infrastructure..."
aws cloudformation deploy \
    --template-file circuit-breaker-infrastructure.yaml \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        ProjectName="$PROJECT_NAME" \
        Environment="$ENVIRONMENT" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$AWS_REGION" \
    --tags \
        Project="$PROJECT_NAME" \
        Environment="$ENVIRONMENT" \
        DeployedBy="$(whoami)" \
        DeployedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ $? -eq 0 ]]; then
    echo "✅ Infrastructure deployment successful!"
    
    # Get stack outputs
    echo ""
    echo "Stack Outputs:"
    echo "=============="
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    # Get dashboard URL
    DASHBOARD_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
        --output text 2>/dev/null)
    
    if [[ -n "$DASHBOARD_URL" ]]; then
        echo ""
        echo "🎯 CloudWatch Dashboard: $DASHBOARD_URL"
    fi
    
    # Save deployment info
    cat > deployment-info.json << EOF
{
    "projectName": "$PROJECT_NAME",
    "environment": "$ENVIRONMENT",
    "region": "$AWS_REGION",
    "stackName": "$STACK_NAME",
    "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "deployedBy": "$(whoami)"
}
EOF
    
    echo ""
    echo "📄 Deployment info saved to: deployment-info.json"
    echo ""
    echo "Next Steps:"
    echo "==========="
    echo "1. Update your Lambda functions' environment variables with the DynamoDB table name"
    echo "2. Deploy your Lambda functions with the appropriate IAM roles"
    echo "3. Set up SQS event source mapping for the alarm processor Lambda"
    echo "4. Test the circuit breaker system"
    
else
    echo "❌ Infrastructure deployment failed!"
    exit 1
fi