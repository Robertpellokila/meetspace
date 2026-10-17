
import "dotenv/config";
import app from './app.js';

const PORT = process.env.PORT || 3000;

// Menjalankan backend
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Could not start MeetSpace API: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`MeetSpace API running on port ${PORT}`);
});
