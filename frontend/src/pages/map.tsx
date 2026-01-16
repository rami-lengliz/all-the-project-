export default function MapPage() {
  return (
    <div className="bg-gray-50 font-sans overflow-hidden">
      <div id="map-container" className="relative" style={{ height: 'calc(100vh - 73px)' }}>
        <div className="absolute inset-0 bg-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src="https://storage.googleapis.com/uxpilot-auth.appspot.com/e61652dc21-cab20e8e19405eef87bb.png"
            alt="interactive map view of Tunis with rental location pins, satellite view, detailed streets"
          />

          <div
            id="pin-1"
            className="absolute top-[15%] left-[20%] bg-blue-500 text-white rounded-full px-3 py-2 shadow-lg text-sm font-semibold cursor-pointer hover:bg-blue-600 hover:scale-110 transition flex items-center"
          >
            <i className="fa-solid fa-house mr-1.5 text-xs" />
            $120/day
          </div>
        </div>

        <div id="search-bar-map" className="absolute top-6 left-1/2 transform -translate-x-1/2 z-40 w-[600px]">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="flex items-stretch">
              <div className="flex-1 p-4 border-r border-gray-200">
                <input
                  type="text"
                  placeholder="What do you want to rent?"
                  className="w-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              </div>

              <div className="flex-1 p-4 border-r border-gray-200">
                <div className="flex items-center">
                  <i className="fa-solid fa-location-dot text-blue-500 mr-2 text-sm" />
                  <input
                    type="text"
                    placeholder="Tunis, Tunisia"
                    className="w-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center px-3">
                <button className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-md transition">
                  <i className="fa-solid fa-search" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="filters-button" className="absolute top-6 left-6 z-40">
          <button className="bg-white rounded-full px-5 py-3 shadow-lg flex items-center space-x-2 border border-gray-200 hover:shadow-xl transition">
            <i className="fa-solid fa-sliders text-gray-700" />
            <span className="text-sm font-medium text-gray-900">Filters</span>
          </button>
        </div>

        <div id="results-count" className="absolute top-6 right-6 z-40">
          <div className="bg-white rounded-full px-5 py-3 shadow-lg border border-gray-200">
            <span className="text-sm font-semibold text-gray-900">Listings in this area</span>
          </div>
        </div>
      </div>
    </div>
  );
}

