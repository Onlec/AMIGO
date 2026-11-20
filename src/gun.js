import Gun from 'gun';

const RELAY_URL = import.meta.env.VITE_GUN_RELAY || 'https://gun-manhattan.herokuapp.com/gun';

const gun = Gun({
  peers: [RELAY_URL],
});

export default gun;
