// Filtre de session — optimise les trades pendant les sessions actives
// Basé sur l'image Forex Factory: London 18:39 active, NY en cours

class SessionFilter {
    // Retourne la session active selon l'heure UTC
    getActiveSession(utcHour) {
        if (utcHour >= 22 || utcHour < 7)  return 'SYDNEY_TOKYO';
        if (utcHour >= 7  && utcHour < 9)  return 'LONDON_OPEN';   // haute volatilité
        if (utcHour >= 9  && utcHour < 13) return 'LONDON';
        if (utcHour >= 13 && utcHour < 17) return 'LONDON_NY';     // overlap = optimal
        if (utcHour >= 17 && utcHour < 22) return 'NEW_YORK';
        return 'OFF';
    }

    // Sessions recommandées pour scalping BTC
    isTradingSession() {
        const hour = new Date().getUTCHours();
        const session = this.getActiveSession(hour);

        // Optimal: London open, overlap London/NY, NY
        const goodSessions = ['LONDON_OPEN', 'LONDON', 'LONDON_NY', 'NEW_YORK'];
        return {
            session,
            recommended: goodSessions.includes(session),
            multiplier: session === 'LONDON_NY' ? 1.2 : 1.0, // bonus score overlap
        };
    }

    // Éviter les périodes de faible liquidité
    isLowLiquidity() {
        const hour = new Date().getUTCHours();
        const min  = new Date().getUTCMinutes();
        // Éviter 30min autour de 00:00 UTC (rollover)
        if (hour === 0 && min < 30) return true;
        // Sydney/Tokyo seul = liquidité réduite sur BTC
        if (hour >= 22 || hour < 6) return true;
        return false;
    }
}

module.exports = SessionFilter;
