const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const STATE_TABLE = process.env.STATE_TABLE || 'circuit-breaker-state';

/**
 * Circuit Breaker State Management
 * 
 * Handles all DynamoDB operations for the circuit breaker system:
 * - System state tracking (current level, failure/success counts)
 * - Failure logging with timestamps
 * - State transitions and recovery tracking
 */

/**
 * Get current system state
 */
async function getSystemState() {
    try {
        const params = {
            TableName: STATE_TABLE,
            Key: {
                pk: 'system-state'
            }
        };
        
        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            // Initialize with default state if not exists
            const defaultState = {
                pk: 'system-state',
                currentLevel: 1,
                failureCount: 0,
                successCount: 0,
                lastTransition: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                transitionReason: 'Initial state'
            };
            
            await updateSystemState(defaultState);
            return defaultState;
        }
        
        return result.Item;
    } catch (error) {
        console.error('Error getting system state:', error);
        throw error;
    }
}

/**
 * Update system state
 */
async function updateSystemState(stateUpdate) {
    try {
        const params = {
            TableName: STATE_TABLE,
            Item: {
                ...stateUpdate,
                lastUpdated: new Date().toISOString()
            }
        };
        
        await dynamodb.put(params).promise();
        console.log('System state updated:', stateUpdate);
        
        return stateUpdate;
    } catch (error) {
        console.error('Error updating system state:', error);
        throw error;
    }
}

/**
 * Log a failure event
 */
async function logFailure(serviceType, errorType, serviceLevel) {
    try {
        const timestamp = new Date().toISOString();
        const params = {
            TableName: STATE_TABLE,
            Item: {
                pk: 'failure-log',
                sk: timestamp,
                service: serviceType,
                serviceLevel: serviceLevel,
                errorType: errorType,
                timestamp: timestamp,
                ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
            }
        };
        
        await dynamodb.put(params).promise();
        console.log('Failure logged:', params.Item);
        
    } catch (error) {
        console.error('Error logging failure:', error);
        throw error;
    }
}

/**
 * Log a success event
 */
async function logSuccess(serviceType, serviceLevel, responseTime) {
    try {
        const timestamp = new Date().toISOString();
        const params = {
            TableName: STATE_TABLE,
            Item: {
                pk: 'success-log',
                sk: timestamp,
                service: serviceType,
                serviceLevel: serviceLevel,
                responseTime: responseTime,
                timestamp: timestamp,
                ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
            }
        };
        
        await dynamodb.put(params).promise();
        console.log('Success logged:', params.Item);
        
    } catch (error) {
        console.error('Error logging success:', error);
        throw error;
    }
}

/**
 * Get recent failures count within time window
 */
async function getRecentFailures(minutesBack = 5) {
    try {
        const timeThreshold = new Date(Date.now() - (minutesBack * 60 * 1000)).toISOString();
        
        const params = {
            TableName: STATE_TABLE,
            KeyConditionExpression: 'pk = :pk AND sk > :threshold',
            ExpressionAttributeValues: {
                ':pk': 'failure-log',
                ':threshold': timeThreshold
            }
        };
        
        const result = await dynamodb.query(params).promise();
        return result.Items || [];
        
    } catch (error) {
        console.error('Error getting recent failures:', error);
        throw error;
    }
}

/**
 * Get recent successes count within time window
 */
async function getRecentSuccesses(minutesBack = 5) {
    try {
        const timeThreshold = new Date(Date.now() - (minutesBack * 60 * 1000)).toISOString();
        
        const params = {
            TableName: STATE_TABLE,
            KeyConditionExpression: 'pk = :pk AND sk > :threshold',
            ExpressionAttributeValues: {
                ':pk': 'success-log',
                ':threshold': timeThreshold
            }
        };
        
        const result = await dynamodb.query(params).promise();
        return result.Items || [];
        
    } catch (error) {
        console.error('Error getting recent successes:', error);
        throw error;
    }
}

/**
 * Increment failure count and check for level transition
 */
async function incrementFailureCount(serviceType, errorType, serviceLevel) {
    try {
        // Log the individual failure
        await logFailure(serviceType, errorType, serviceLevel);
        
        // Get current state
        const currentState = await getSystemState();
        
        // Increment failure count and reset success count
        const updatedState = {
            ...currentState,
            failureCount: currentState.failureCount + 1,
            successCount: 0 // Reset success count on any failure
        };
        
        // Check for level transitions based on failure thresholds
        let shouldTransition = false;
        let newLevel = currentState.currentLevel;
        let transitionReason = '';
        
        if (currentState.currentLevel === 1 && updatedState.failureCount >= 5) {
            newLevel = 2;
            shouldTransition = true;
            transitionReason = `Transition 1→2: ${updatedState.failureCount} failures detected`;
        } else if (currentState.currentLevel === 2 && updatedState.failureCount >= 10) {
            newLevel = 3;
            shouldTransition = true;
            transitionReason = `Transition 2→3: ${updatedState.failureCount} total failures detected`;
        }
        
        if (shouldTransition) {
            updatedState.currentLevel = newLevel;
            updatedState.lastTransition = new Date().toISOString();
            updatedState.transitionReason = transitionReason;
            console.log('Level transition triggered:', transitionReason);
        }
        
        await updateSystemState(updatedState);
        return { state: updatedState, transitioned: shouldTransition };
        
    } catch (error) {
        console.error('Error incrementing failure count:', error);
        throw error;
    }
}

/**
 * Increment success count and check for recovery
 */
async function incrementSuccessCount(serviceType, serviceLevel, responseTime) {
    try {
        // Log the individual success
        await logSuccess(serviceType, serviceLevel, responseTime);
        
        // Get current state
        const currentState = await getSystemState();
        
        // Increment success count
        const updatedState = {
            ...currentState,
            successCount: currentState.successCount + 1
        };
        
        // Check for recovery transitions based on success thresholds
        let shouldTransition = false;
        let newLevel = currentState.currentLevel;
        let transitionReason = '';
        
        if (currentState.currentLevel === 3 && updatedState.successCount >= 3) {
            newLevel = 2;
            shouldTransition = true;
            transitionReason = `Recovery 3→2: ${updatedState.successCount} consecutive successes`;
            updatedState.failureCount = 0; // Reset failure count on recovery
        } else if (currentState.currentLevel === 2 && updatedState.successCount >= 5) {
            newLevel = 1;
            shouldTransition = true;
            transitionReason = `Recovery 2→1: ${updatedState.successCount} consecutive successes`;
            updatedState.failureCount = 0; // Reset failure count on recovery
        }
        
        if (shouldTransition) {
            updatedState.currentLevel = newLevel;
            updatedState.lastTransition = new Date().toISOString();
            updatedState.transitionReason = transitionReason;
            updatedState.successCount = 0; // Reset success count after successful recovery
            console.log('Recovery transition triggered:', transitionReason);
        }
        
        await updateSystemState(updatedState);
        return { state: updatedState, transitioned: shouldTransition };
        
    } catch (error) {
        console.error('Error incrementing success count:', error);
        throw error;
    }
}

module.exports = {
    getSystemState,
    updateSystemState,
    logFailure,
    logSuccess,
    getRecentFailures,
    getRecentSuccesses,
    incrementFailureCount,
    incrementSuccessCount
};