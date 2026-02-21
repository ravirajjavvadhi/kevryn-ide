try {
    console.log('Testing imports...');

    console.log('1. Requiring cookie-parser...');
    require('cookie-parser');
    console.log('✅ cookie-parser loaded');

    console.log('2. Requiring File...');
    require('./File');
    console.log('✅ File loaded');

    console.log('3. Requiring User...');
    require('./User');
    console.log('✅ User loaded');

    console.log('4. Requiring LabSessionModel...');
    require('./LabSessionModel');
    console.log('✅ LabSessionModel loaded');

    console.log('ALL IMPORTS SUCCESSFUL');
} catch (error) {
    console.error('❌ IMPORT FAILED:', error);
}
