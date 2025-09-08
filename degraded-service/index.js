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
    const startTime = Date.now();
    
    try {
        console.log('Nivel 2 - Degraded Service invoked:', JSON.stringify(event, null, 2));
        
        // Parse request body for K6 test payload
        let requestBody = {};
        let accountId = 'default-account';
        let shouldFail = false;
        
        if (event.body) {
            try {
                requestBody = JSON.parse(event.body);
                console.log('Parsed request body:', requestBody);
                
                // Use error field from K6 payload to determine if we should fail
                shouldFail = requestBody.error === true;
                
                // Extract account ID if provided in path parameters or body
                accountId = event.pathParameters?.accountId || requestBody.accountId || 'test-account';
                
            } catch (parseError) {
                console.log('Could not parse request body, using defaults:', parseError.message);
            }
        }
        
        console.log('Level 2 processing request for account:', accountId, 'shouldFail:', shouldFail);
        
        if (shouldFail) {
            throw new Error('Controlled failure triggered by test payload');
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
                'X-Service-Level': '2',
                'X-Service-Type': 'degraded-service'
            },
            body: JSON.stringify({
                service: 'Nivel 2 - Servicio Degradado',
                level: 2,
                accountId: accountId,
                status: 'degraded',
                message: 'Funcionalidad parcial - Últimas 5 transferencias en caché',
                testInfo: {
                    requestedError: requestBody.error,
                    actualError: false,
                    requestTimestamp: requestBody.timestamp,
                    responseTime: Date.now() - startTime
                },
                data: {
                    balance: {
                        amount: 12500.75,
                        currency: 'USD'
                    },
                    transfers: [
                        { id: 1, amount: 500, type: 'credit', date: '2024-01-01' },
                        { id: 2, amount: 250, type: 'debit', date: '2024-01-02' },
                        { id: 3, amount: 1000, type: 'credit', date: '2024-01-03' },
                        { id: 4, amount: 750, type: 'debit', date: '2024-01-04' },
                        { id: 5, amount: 300, type: 'credit', date: '2024-01-05' }
                    ],
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
                'X-Service-Level': '2',
                'X-Service-Type': 'degraded-service'
            },
            body: JSON.stringify({
                service: 'Nivel 2 - Servicio Degradado',
                level: 2,
                accountId: accountId,
                status: 'error',
                message: 'Error en servicio degradado',
                testInfo: {
                    requestedError: requestBody.error,
                    actualError: true,
                    requestTimestamp: requestBody.timestamp,
                    responseTime: Date.now() - startTime
                },
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};