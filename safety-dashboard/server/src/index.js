const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/colaboradores', require('./routes/colaboradores'));
app.use('/api/dtos', require('./routes/dtos'));
app.use('/api/avaliacoes', require('./routes/avaliacoes'));
app.use('/api/telemetria', require('./routes/telemetria'));
app.use('/api/encaminhamentos', require('./routes/encaminhamentos'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));

app.use(require('./middleware/errorHandler'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
