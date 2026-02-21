const axios = require('axios');
const jwt = require('jsonwebtoken');

const verify = async () => {
    try {
        const token = jwt.sign({ _id: '67aef...dummy', role: 'admin' }, 'my_super_secret_key_123');

        console.log("Using Token:", token);

        const res = await axios.get('http://localhost:5001/api/admin/analytics', {
            headers: { Authorization: token }
        });

        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("Error:", e.response ? e.response.status : e.message);
        if (e.response && e.response.data) console.log(e.response.data);
    }
};

verify();
