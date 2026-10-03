const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://joaovitorcavallin:Joao0113!@iccmaker.msogvv1.mongodb.net/iccmaker?retryWrites=true&w=majority')
  .then(async () => {
    try {
      const Option = mongoose.model('Option', new mongoose.Schema({}));
      await Option.findById(undefined);
      console.log('Success');
    } catch(e) {
      console.log('Error:', e.message);
    }
    process.exit(0);
  });
