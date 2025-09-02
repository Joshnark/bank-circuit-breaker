const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

/**
 * NIVEL 3 - MODO MANTENIMIENTO
 * 
 * Funcionalidad a implementar:
 * 1. Responder con mensajes de mantenimiento según especificación:
 *    - ERROR: "Nivel 3: Sistema bajo mantenimiento, intente más tarde"
 *    - ÉXITO: "Nivel 3: Operación al mínimo"
 * 2. Simular fallas ocasionales (10% probabilidad) para determinar mensaje
 * 3. Registrar métricas de éxito/error en CloudWatch
 * 4. Proveer funcionalidad mínima garantizada del sistema
 * 5. Sin acceso a datos de cuentas ni transferencias
 * 
 * Este es el nivel de máxima degradación con funcionalidad mínima
 */

exports.handler = async (event) => {
    const accountId = event.pathParameters?.accountId || 'default-account';
    
    try {
        console.log('Nivel 3 - Maintenance Service invoked for account:', accountId);
        
        // TODO: Simular falla ocasional (10% probabilidad) para determinar mensaje
        // TODO: Registrar métricas en CloudWatch
        
        // Determinar si debe responder con éxito o error
        const shouldFail = Math.random() < 0.1; // 10% probabilidad de fallo
        
        if (shouldFail) {
            // Respuesta de error según especificación
            return {
                statusCode: 503,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service: 'Nivel 3 - Modo Mantenimiento',
                    level: 3,
                    accountId: accountId,
                    status: 'maintenance_error',
                    message: 'Nivel 3: Sistema bajo mantenimiento, intente más tarde',
                    features: {
                        balanceInquiry: false,
                        transferHistory: false,
                        newTransfers: false,
                        fullReporting: false
                    },
                    timestamp: new Date().toISOString()
                })
            };
        } else {
            // Respuesta de éxito según especificación
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service: 'Nivel 3 - Modo Mantenimiento',
                    level: 3,
                    accountId: accountId,
                    status: 'maintenance_minimal',
                    message: 'Nivel 3: Operación al mínimo',
                    data: {
                        balance: null,
                        transfers: null,
                        note: 'Solo funcionalidad mínima disponible'
                    },
                    features: {
                        balanceInquiry: false,
                        transferHistory: false,
                        newTransfers: false,
                        fullReporting: false
                    },
                    timestamp: new Date().toISOString()
                })
            };
        }
        
    } catch (error) {
        console.error('Nivel 3 - Error crítico:', error);
        
        // TODO: Registrar métrica de error crítico en CloudWatch
        
        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                service: 'Nivel 3 - Modo Mantenimiento',
                level: 3,
                accountId: accountId,
                status: 'critical_error',
                message: 'Nivel 3: Sistema bajo mantenimiento, intente más tarde',
                error: 'Error crítico del sistema',
                timestamp: new Date().toISOString()
            })
        };
    }
};