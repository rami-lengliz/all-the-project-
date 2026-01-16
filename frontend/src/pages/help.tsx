export default function HelpPage() {
  return (
    <div className="bg-gray-50 font-sans">
      <section id="hero-help" className="bg-gradient-to-br from-blue-500 to-blue-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold mb-4">How can we help you?</h1>
            <p className="text-lg text-blue-100 mb-8">Get answers, guidance, and support for renting or hosting</p>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center p-4">
                <i className="fa-solid fa-search text-gray-400 text-xl ml-2" />
                <input
                  type="text"
                  placeholder="Search for help articles, guides, or questions..."
                  className="flex-1 px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none"
                />
                <button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition">
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="quick-actions" className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Quick actions</h2>

          <div className="grid grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 hover:shadow-lg transition cursor-pointer group">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <i className="fa-solid fa-comments text-white text-xl" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Chat with us</h3>
              <p className="text-sm text-gray-600">Get instant help from our support team</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200 hover:shadow-lg transition cursor-pointer group">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <i className="fa-solid fa-book-open text-white text-xl" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Browse guides</h3>
              <p className="text-sm text-gray-600">Step-by-step tutorials and tips</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200 hover:shadow-lg transition cursor-pointer group">
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <i className="fa-solid fa-circle-question text-white text-xl" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">View FAQs</h3>
              <p className="text-sm text-gray-600">Common questions answered</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200 hover:shadow-lg transition cursor-pointer group">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <i className="fa-solid fa-envelope text-white text-xl" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Contact support</h3>
              <p className="text-sm text-gray-600">Send us a detailed message</p>
            </div>
          </div>
        </div>
      </section>

      <section id="help-categories" className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Browse by topic</h2>

          <div className="grid grid-cols-2 gap-6">
            <div id="renter-help" className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition">
              <div className="flex items-start mb-6">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
                  <i className="fa-solid fa-user text-blue-500 text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">For Renters</h3>
                  <p className="text-gray-600">Everything you need to know about renting items</p>
                </div>
              </div>

              <div className="space-y-3">
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-blue-500">How to search and book items</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-blue-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-blue-500">Payment and pricing</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-blue-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-blue-500">Pickup and return process</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-blue-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-blue-500">Cancellation policy</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-blue-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-blue-500">Reporting issues</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-blue-500" />
                </a>
              </div>
            </div>

            <div id="host-help" className="bg-white rounded-xl p-8 border border-gray-200 hover:shadow-lg transition">
              <div className="flex items-start mb-6">
                <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mr-4">
                  <i className="fa-solid fa-home text-green-500 text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">For Hosts</h3>
                  <p className="text-gray-600">Learn how to list and manage your items</p>
                </div>
              </div>

              <div className="space-y-3">
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-green-500">Creating your first listing</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-green-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-green-500">Setting prices and availability</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-green-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-green-500">Managing bookings</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-green-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-green-500">Getting paid</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-green-500" />
                </a>
                <a href="#" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition group">
                  <span className="text-gray-700 group-hover:text-green-500">Host protection and insurance</span>
                  <i className="fa-solid fa-chevron-right text-gray-400 group-hover:text-green-500" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="chat-assistant" className="bg-white py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-robot text-white text-2xl" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Chat Assistant</h2>
            <p className="text-gray-600">Get instant answers to your questions</p>
          </div>

          <div id="chat-container" className="bg-gray-50 rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center mr-3">
                  <i className="fa-solid fa-robot text-lg" />
                </div>
                <div>
                  <h3 className="font-semibold">RentLocal Assistant</h3>
                  <p className="text-xs text-blue-100">Online</p>
                </div>
              </div>
              <button className="w-8 h-8 hover:bg-white hover:bg-opacity-20 rounded-full flex items-center justify-center transition">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-6 space-y-4" style={{ height: 400, overflowY: 'auto' }}>
              <div className="flex items-start">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                  <i className="fa-solid fa-robot text-white text-sm" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none p-4 shadow-sm max-w-md">
                  <p className="text-gray-800">
                    Hello! I'm here to help you with anything related to RentLocal. What can I assist you with today?
                  </p>
                </div>
              </div>

              <div className="flex items-start justify-end">
                <div className="bg-blue-500 text-white rounded-2xl rounded-tr-none p-4 shadow-sm max-w-md">
                  <p>How do I create a listing?</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                  <i className="fa-solid fa-robot text-white text-sm" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none p-4 shadow-sm max-w-md">
                  <p className="text-gray-800 mb-3">Creating a listing is easy! Here are the steps:</p>
                  <ol className="text-gray-800 space-y-2 text-sm">
                    <li className="flex items-start">
                      <span className="font-semibold mr-2">1.</span>
                      <span>Go to your profile and click "Become a host"</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold mr-2">2.</span>
                      <span>Upload photos of your item</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold mr-2">3.</span>
                      <span>Add title, description, and category</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold mr-2">4.</span>
                      <span>Set your price and availability</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-semibold mr-2">5.</span>
                      <span>Publish your listing!</span>
                    </li>
                  </ol>
                  <p className="text-gray-600 text-sm mt-3">Would you like more detailed guidance on any of these steps?</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <button className="w-10 h-10 hover:bg-gray-100 rounded-full flex items-center justify-center transition">
                  <i className="fa-solid fa-paperclip text-gray-500" />
                </button>
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="w-10 h-10 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition">
                  <i className="fa-solid fa-paper-plane text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

