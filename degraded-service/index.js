const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

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
    
    try {
        console.log('Nivel 2 - Degraded Service invoked for account:', accountId);
        
        // TODO: Simular fallo aleatorio menos frecuente (2% probabilidad)
        // TODO: Consultar balance de cuenta (operación rápida)
        // TODO: Obtener solo últimas 5 transferencias desde caché
        // TODO: Registrar métrica de éxito en CloudWatch
        
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
        
        // TODO: Registrar métrica de error en CloudWatch
        
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