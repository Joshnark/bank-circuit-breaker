const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

/**
 * Publishes metrics to CloudWatch
 */
async function publishMetric(namespace, metricName, value, dimensions) {
    try {
        const params = {
            Namespace: namespace,
            MetricData: [{
                MetricName: metricName,
                Value: value,
                Unit: metricName === 'ResponseTime' ? 'Milliseconds' : 'Count',
                Dimensions: dimensions,
                Timestamp: new Date()
            }]
        };
        
        await cloudwatch.putMetricData(params).promise();
    } catch (error) {
        console.error('Failed to publish metric:', error);
    }
}

/**
 * NIVEL 1 - SERVICIO COMPLETO
 * 
 * Funcionalidad a implementar:
 * 1. Consultar balance completo de la cuenta desde base de datos
 * 2. Obtener historial COMPLETO de transferencias (operación costosa)
 * 3. Simular fallas aleatorias para testing del circuit breaker (5% probabilidad)
 * 4. Registrar métricas de éxito/error en CloudWatch
 * 5. Responder con:
 *    - Balance de cuenta
 *    - Lista completa de transferencias
 *    - Funcionalidades disponibles
 * 
 * Este es el nivel de mayor funcionalidad pero también el más costoso computacionalmente
 */

exports.handler = async (event) => {
    const accountId = event.pathParameters?.accountId || 'default-account';
    const startTime = Date.now();
    
    try {
        console.log('Nivel 1 - Full Service invoked for account:', accountId);
        
        // Simulate random failure (5% probability) for testing
        const shouldFail = Math.random() < 0.05;
        if (shouldFail) {
            throw new Error('Simulated failure for circuit breaker testing');
        }
        
        // Simulate processing time for full service
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        
        // TODO: Consultar balance real de base de datos
        // TODO: Obtener historial COMPLETO de transferencias
        
        // Log success metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Success', 1, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' }
        ]);
        
        // Log response time metric
        await publishMetric('CircuitBreaker/Service', 'ResponseTime', Date.now() - startTime, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' }
        ]);
        
        console.log('Nivel 1 - Success metric published to CloudWatch');
        
        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service: 'Nivel 1 - Servicio Completo',
                level: 1,
                accountId: accountId,
                status: 'operational',
                message: 'Funcionalidad completa disponible',
                data: {
                    // TODO: Implementar datos reales
                    balance: {
                        amount: 0,
                        currency: 'USD'
                    },
                    transfers: [], // TODO: Historial completo
                    features: {
                        balanceInquiry: true,
                        transferHistory: true,
                        newTransfers: true,
                        fullReporting: true
                    }
                },
                timestamp: new Date().toISOString()
            })
        };

        console.log('Nivel 1 - Respuesta exitosa');
        return response;
        
    } catch (error) {
        console.error('Nivel 1 - Error:', error);
        
        // Log error metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Error', 1, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' },
            { Name: 'ErrorType', Value: error.message.includes('Simulated') ? 'SimulatedFailure' : 'SystemError' }
        ]);
        
        console.log('Nivel 1 - Error metric published to CloudWatch');
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service: 'Nivel 1 - Servicio Completo',
                level: 1,
                accountId: accountId,
                status: 'error',
                message: 'Error en servicio completo',
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};