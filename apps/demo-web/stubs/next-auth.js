function NextAuth() {
  return () => null;
}

async function getServerSession() {
  return null;
}

module.exports = NextAuth;
module.exports.default = NextAuth;
module.exports.getServerSession = getServerSession;
