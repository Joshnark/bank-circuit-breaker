const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

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
    
    try {
        console.log('Nivel 1 - Full Service invoked for account:', accountId);
        
        // TODO: Simular fallo aleatorio (5% probabilidad) para testing
        // TODO: Consultar balance real de base de datos
        // TODO: Obtener historial COMPLETO de transferencias
        // TODO: Registrar métrica de éxito en CloudWatch
        
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
        
        // TODO: Registrar métrica de error en CloudWatch
        
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