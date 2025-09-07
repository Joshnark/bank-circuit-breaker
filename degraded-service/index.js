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
 * NIVEL 2 - SERVICIO DEGRADADO
 * 
 * Funcionalidad a implementar:
 * 1. Consultar balance de la cuenta (operación rápida)
 * 2. Obtener SOLO las últimas 5 transferencias desde CACHÉ (optimización)
 * 3. Simular fallas menos frecuentes que Nivel 1 (2% probabilidad)
 * 4. Registrar métricas de éxito/error en CloudWatch
 * 5. Responder con:
 *    - Balance de cuenta
 *    - Solo últimas 5 transferencias (datos en caché)
 *    - Funcionalidades limitadas
 * 
 * Este nivel ofrece funcionalidad parcial pero más confiable que Nivel 1
 */

exports.handler = async (event) => {
    const accountId = event.pathParameters?.accountId || 'default-account';
    const startTime = Date.now();
    
    try {
        console.log('Nivel 2 - Degraded Service invoked for account:', accountId);
        
        // Simulate less frequent random failure (2% probability)
        const shouldFail = Math.random() < 0.02;
        if (shouldFail) {
            throw new Error('Simulated failure for circuit breaker testing');
        }
        
        // Simulate faster processing time for degraded service
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
        
        // TODO: Consultar balance de cuenta (operación rápida)
        // TODO: Obtener solo últimas 5 transferencias desde caché
        
        // Log success metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Success', 1, [
            { Name: 'ServiceLevel', Value: '2' },
            { Name: 'ServiceType', Value: 'degraded-service' }
        ]);
        
        // Log response time metric
        await publishMetric('CircuitBreaker/Service', 'ResponseTime', Date.now() - startTime, [
            { Name: 'ServiceLevel', Value: '2' },
            { Name: 'ServiceType', Value: 'degraded-service' }
        ]);
        
        console.log('Nivel 2 - Success metric published to CloudWatch');
        
        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service: 'Nivel 2 - Servicio Degradado',
                level: 2,
                accountId: accountId,
                status: 'degraded',
                message: 'Funcionalidad parcial - Últimas 5 transferencias en caché',
                data: {
                    // TODO: Implementar datos reales
                    balance: {
                        amount: 0,
                        currency: 'USD'
                    },
                    transfers: [], // TODO: Solo últimas 5 desde caché
                    transfersNote: 'Mostrando solo últimas 5 transferencias (datos en caché)',
                    features: {
                        balanceInquiry: true,
                        transferHistory: true, // Solo limitado
                        newTransfers: false, // Deshabilitado
                        fullReporting: false // Deshabilitado
                    }
                },
                limitations: [
                    'Solo últimas 5 transferencias disponibles',
                    'Nuevas transferencias deshabilitadas',
                    'Reportes completos no disponibles'
                ],
                timestamp: new Date().toISOString()
            })
        };

        console.log('Nivel 2 - Respuesta exitosa');
        return response;
        
    } catch (error) {
        console.error('Nivel 2 - Error:', error);
        
        // Log error metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Error', 1, [
            { Name: 'ServiceLevel', Value: '2' },
            { Name: 'ServiceType', Value: 'degraded-service' },
            { Name: 'ErrorType', Value: error.message.includes('Simulated') ? 'SimulatedFailure' : 'SystemError' }
        ]);
        
        console.log('Nivel 2 - Error metric published to CloudWatch');
        
        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service: 'Nivel 2 - Servicio Degradado',
                level: 2,
                accountId: accountId,
                status: 'error',
                message: 'Error en servicio degradado',
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};