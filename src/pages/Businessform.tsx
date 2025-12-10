import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase, Business } from '../lib/supabase';
import { 
  Save, 
  ArrowLeft,
  Upload,
  X,
  Plus,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  Star,
  Package,
  Users
} from 'lucide-react';

export default function BusinessForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    tagline: '',
    description: '',
    full_description: '',
    price: 50000,
    equity_percentage: 10,
    status: 'draft' as Business['status'],
    industry: '',
    business_type: '',
    target_revenue: '',
    time_to_revenue: '',
    scalability_score: 5
  });

  // Related data
  const [documents, setDocuments] = useState<Array<{ title: string; file: File | null; description: string }>>([]);
  const [links, setLinks] = useState<Array<{ title: string; url: string; category: string; description: string }>>([]);
  const [images, setImages] = useState<Array<{ file: File | null; caption: string; is_primary: boolean; url?: string }>>([]);
  const [features, setFeatures] = useState<Array<{ feature_text: string; icon: string }>>([]);
  const [packages, setPackages] = useState<Array<{ package_item: string; description: string; is_included: boolean }>>([]);
  const [customerSegments, setCustomerSegments] = useState<Array<{ segment_name: string; description: string }>>([]);

  useEffect(() => {
    if (id) {
      fetchBusiness();
    }
  }, [id]);

  const fetchBusiness = async () => {
    if (!id) return;

    try {
      setLoading(true);
      
      // Fetch business
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', id)
        .single();

      if (businessError) throw businessError;
      
      if (business) {
        setFormData(business);
      }

      // Fetch related data
      const [docsRes, linksRes, imagesRes, featuresRes, packagesRes, segmentsRes] = await Promise.all([
        supabase.from('business_documents').select('*').eq('business_id', id),
        supabase.from('business_links').select('*').eq('business_id', id),
        supabase.from('business_images').select('*').eq('business_id', id),
        supabase.from('business_features').select('*').eq('business_id', id),
        supabase.from('business_packages').select('*').eq('business_id', id),
        supabase.from('business_customer_segments').select('*').eq('business_id', id)
      ]);

      if (linksRes.data) setLinks(linksRes.data.map(l => ({ ...l, file: null })));
      if (imagesRes.data) setImages(imagesRes.data.map(i => ({ file: null, caption: i.caption || '', is_primary: i.is_primary, url: i.url })));
      if (featuresRes.data) setFeatures(featuresRes.data);
      if (packagesRes.data) setPackages(packagesRes.data);
      if (segmentsRes.data) setCustomerSegments(segmentsRes.data);

    } catch (error) {
      console.error('Error fetching business:', error);
      alert('Failed to load business data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let businessId = id;

      // Create or update business
      if (id) {
        const { error } = await supabase
          .from('businesses')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('businesses')
          .insert([formData])
          .select()
          .single();

        if (error) throw error;
        businessId = data.id;
      }

      // Save related data
      if (businessId) {
        await saveRelatedData(businessId);
      }

      alert(id ? 'Business updated successfully!' : 'Business created successfully!');
      navigate(`/businesses/${businessId}`);
      
    } catch (error) {
      console.error('Error saving business:', error);
      alert('Failed to save business');
    } finally {
      setLoading(false);
    }
  };

  const saveRelatedData = async (businessId: string) => {
    // Save links
    if (links.length > 0) {
      await supabase.from('business_links').delete().eq('business_id', businessId);
      const linksToInsert = links.filter(l => l.title && l.url).map(l => ({
        business_id: businessId,
        ...l
      }));
      if (linksToInsert.length > 0) {
        await supabase.from('business_links').insert(linksToInsert);
      }
    }

    // Save features
    if (features.length > 0) {
      await supabase.from('business_features').delete().eq('business_id', businessId);
      const featuresToInsert = features.filter(f => f.feature_text).map((f, idx) => ({
        business_id: businessId,
        ...f,
        display_order: idx
      }));
      if (featuresToInsert.length > 0) {
        await supabase.from('business_features').insert(featuresToInsert);
      }
    }

    // Save packages
    if (packages.length > 0) {
      await supabase.from('business_packages').delete().eq('business_id', businessId);
      const packagesToInsert = packages.filter(p => p.package_item).map((p, idx) => ({
        business_id: businessId,
        ...p,
        display_order: idx
      }));
      if (packagesToInsert.length > 0) {
        await supabase.from('business_packages').insert(packagesToInsert);
      }
    }

    // Save customer segments
    if (customerSegments.length > 0) {
      await supabase.from('business_customer_segments').delete().eq('business_id', businessId);
      const segmentsToInsert = customerSegments.filter(s => s.segment_name).map(s => ({
        business_id: businessId,
        ...s
      }));
      if (segmentsToInsert.length > 0) {
        await supabase.from('business_customer_segments').insert(segmentsToInsert);
      }
    }

    // Upload and save images
    for (const [idx, image] of images.entries()) {
      if (image.file) {
        const fileExt = image.file.name.split('.').pop();
        const fileName = `${businessId}/${Date.now()}_${idx}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('business-files')
          .upload(fileName, image.file);

        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('business-files')
            .getPublicUrl(fileName);

          await supabase.from('business_images').insert({
            business_id: businessId,
            url: publicUrl,
            caption: image.caption,
            is_primary: image.is_primary,
            display_order: idx
          });
        }
      }
    }
  };

  const tabs = [
    { id: 'basic', name: 'Basic Info', icon: FileText },
    { id: 'media', name: 'Images', icon: ImageIcon },
    { id: 'features', name: 'Features', icon: Star },
    { id: 'package', name: 'Package', icon: Package },
    { id: 'links', name: 'Links', icon: LinkIcon },
    { id: 'customers', name: 'Customers', icon: Users }
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/businesses"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {id ? 'Edit Business' : 'Create New Business'}
              </h1>
              <p className="text-gray-600 mt-1">
                {id ? 'Update your business details' : 'Add a new pre-made business to your portfolio'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tab Navigation */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="border-b border-gray-200 overflow-x-auto">
              <nav className="flex space-x-1 p-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap
                        ${activeTab === tab.id
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <Icon size={18} />
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="p-6">
              {/* Basic Info Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Business Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter business name"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tagline
                      </label>
                      <input
                        type="text"
                        value={formData.tagline || ''}
                        onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="A short, catchy tagline"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Short Description
                      </label>
                      <textarea
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Brief overview (2-3 sentences)"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Description
                      </label>
                      <textarea
                        value={formData.full_description || ''}
                        onChange={(e) => setFormData({ ...formData, full_description: e.target.value })}
                        rows={6}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Detailed business description"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Price (€) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Equity Percentage (%) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.equity_percentage}
                        onChange={(e) => setFormData({ ...formData, equity_percentage: Number(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Status *
                      </label>
                      <select
                        required
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as Business['status'] })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="sold">Sold</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Industry
                      </label>
                      <input
                        type="text"
                        value={formData.industry || ''}
                        onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., E-commerce, SaaS, Marketing"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Business Type
                      </label>
                      <input
                        type="text"
                        value={formData.business_type || ''}
                        onChange={(e) => setFormData({ ...formData, business_type: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Marketplace, Subscription, Service"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Revenue
                      </label>
                      <input
                        type="text"
                        value={formData.target_revenue || ''}
                        onChange={(e) => setFormData({ ...formData, target_revenue: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., €100K/year, €500K ARR"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Time to Revenue
                      </label>
                      <input
                        type="text"
                        value={formData.time_to_revenue || ''}
                        onChange={(e) => setFormData({ ...formData, time_to_revenue: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., 3-6 months, Immediate"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scalability Score (1-10)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.scalability_score || 5}
                        onChange={(e) => setFormData({ ...formData, scalability_score: Number(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Images Tab */}
              {activeTab === 'media' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Business Images</h3>
                    <button
                      type="button"
                      onClick={() => setImages([...images, { file: null, caption: '', is_primary: false }])}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={18} />
                      <span>Add Image</span>
                    </button>
                  </div>

                  {images.map((image, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Image {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setImages(images.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Upload Image
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const newImages = [...images];
                              newImages[index].file = file;
                              setImages(newImages);
                            }
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      {image.url && (
                        <div>
                          <img src={image.url} alt="" className="w-full h-48 object-cover rounded-lg" />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Caption
                        </label>
                        <input
                          type="text"
                          value={image.caption}
                          onChange={(e) => {
                            const newImages = [...images];
                            newImages[index].caption = e.target.value;
                            setImages(newImages);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Image caption"
                        />
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={image.is_primary}
                          onChange={(e) => {
                            const newImages = images.map((img, i) => ({
                              ...img,
                              is_primary: i === index ? e.target.checked : false
                            }));
                            setImages(newImages);
                          }}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Set as primary image
                        </label>
                      </div>
                    </div>
                  ))}

                  {images.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No images added yet. Click "Add Image" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Features Tab */}
              {activeTab === 'features' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Key Features</h3>
                    <button
                      type="button"
                      onClick={() => setFeatures([...features, { feature_text: '', icon: '' }])}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={18} />
                      <span>Add Feature</span>
                    </button>
                  </div>

                  {features.map((feature, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Feature {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setFeatures(features.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Feature Description
                        </label>
                        <input
                          type="text"
                          value={feature.feature_text}
                          onChange={(e) => {
                            const newFeatures = [...features];
                            newFeatures[index].feature_text = e.target.value;
                            setFeatures(newFeatures);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Describe the feature"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Icon (optional)
                        </label>
                        <input
                          type="text"
                          value={feature.icon || ''}
                          onChange={(e) => {
                            const newFeatures = [...features];
                            newFeatures[index].icon = e.target.value;
                            setFeatures(newFeatures);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Icon name or emoji"
                        />
                      </div>
                    </div>
                  ))}

                  {features.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No features added yet. Click "Add Feature" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Package Tab */}
              {activeTab === 'package' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">What's Included</h3>
                    <button
                      type="button"
                      onClick={() => setPackages([...packages, { package_item: '', description: '', is_included: true }])}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={18} />
                      <span>Add Item</span>
                    </button>
                  </div>

                  {packages.map((pkg, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Package Item {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setPackages(packages.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={pkg.package_item}
                          onChange={(e) => {
                            const newPackages = [...packages];
                            newPackages[index].package_item = e.target.value;
                            setPackages(newPackages);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g., Professional Website"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <textarea
                          value={pkg.description || ''}
                          onChange={(e) => {
                            const newPackages = [...packages];
                            newPackages[index].description = e.target.value;
                            setPackages(newPackages);
                          }}
                          rows={2}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Additional details"
                        />
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={pkg.is_included}
                          onChange={(e) => {
                            const newPackages = [...packages];
                            newPackages[index].is_included = e.target.checked;
                            setPackages(newPackages);
                          }}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Included in package
                        </label>
                      </div>
                    </div>
                  ))}

                  {packages.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No package items added yet. Click "Add Item" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Links Tab */}
              {activeTab === 'links' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">External Links & Resources</h3>
                    <button
                      type="button"
                      onClick={() => setLinks([...links, { title: '', url: '', category: 'reference', description: '' }])}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={18} />
                      <span>Add Link</span>
                    </button>
                  </div>

                  {links.map((link, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Link {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setLinks(links.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Title
                          </label>
                          <input
                            type="text"
                            value={link.title}
                            onChange={(e) => {
                              const newLinks = [...links];
                              newLinks[index].title = e.target.value;
                              setLinks(newLinks);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Link title"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Category
                          </label>
                          <select
                            value={link.category}
                            onChange={(e) => {
                              const newLinks = [...links];
                              newLinks[index].category = e.target.value;
                              setLinks(newLinks);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="reference">Reference</option>
                            <option value="competitor">Competitor</option>
                            <option value="tool">Tool</option>
                            <option value="research">Research</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            URL
                          </label>
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => {
                              const newLinks = [...links];
                              newLinks[index].url = e.target.value;
                              setLinks(newLinks);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="https://..."
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                          </label>
                          <textarea
                            value={link.description || ''}
                            onChange={(e) => {
                              const newLinks = [...links];
                              newLinks[index].description = e.target.value;
                              setLinks(newLinks);
                            }}
                            rows={2}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="What is this link for?"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {links.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No links added yet. Click "Add Link" to get started.
                    </div>
                  )}
                </div>
              )}

              {/* Customers Tab */}
              {activeTab === 'customers' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Target Customer Segments</h3>
                    <button
                      type="button"
                      onClick={() => setCustomerSegments([...customerSegments, { segment_name: '', description: '' }])}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={18} />
                      <span>Add Segment</span>
                    </button>
                  </div>

                  {customerSegments.map((segment, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Segment {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => setCustomerSegments(customerSegments.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Segment Name
                        </label>
                        <input
                          type="text"
                          value={segment.segment_name}
                          onChange={(e) => {
                            const newSegments = [...customerSegments];
                            newSegments[index].segment_name = e.target.value;
                            setCustomerSegments(newSegments);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g., Young Professionals, Digital Nomads"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <textarea
                          value={segment.description || ''}
                          onChange={(e) => {
                            const newSegments = [...customerSegments];
                            newSegments[index].description = e.target.value;
                            setCustomerSegments(newSegments);
                          }}
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          placeholder="Describe this customer segment"
                        />
                      </div>
                    </div>
                  ))}

                  {customerSegments.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      No customer segments added yet. Click "Add Segment" to get started.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end space-x-4">
            <Link
              to="/businesses"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 font-medium"
            >
              <Save size={20} />
              <span>{loading ? 'Saving...' : id ? 'Update Business' : 'Create Business'}</span>
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}